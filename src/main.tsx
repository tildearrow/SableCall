/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// We need to import this somewhere, once, so that the correct 'request'
// function gets set. It needs to be not in the same file as we use
// createClient, or the typescript transpiler gets confused about
// dependency references.
import "matrix-js-sdk/lib/browser-index";

// the following code is taken from Vesktop, with some modifications.
/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * adapted for Sable on browser
 */

const originalDM = navigator.mediaDevices.getDisplayMedia;
var screenShareDeviceName = "vencord-screen-share";

async function getVirtmic() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        // change this string to select a different device or window.
        const audioDevice = devices.find(({ label }) => label === screenShareDeviceName);
        return audioDevice?.deviceId;
    } catch (error) {
        return null;
    }
}

navigator.mediaDevices.getDisplayMedia = async function (opts) {
    console.log("called getDisplayMedia!!!!");
    const stream = await originalDM.call(this, opts);

    if (navigator.platform.startsWith("Linux")) {
        console.log("Linux Workaround.");
        const id = await getVirtmic();

        if (id) {
            console.log("binding audio...");
            const audio = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: {
                        exact: id
                    },
                    autoGainControl: false,
                    echoCancellation: false,
                    noiseSuppression: false,
                    channelCount: 2,
                    sampleRate: 48000,
                    sampleSize: 16
                }
            });

            stream.getAudioTracks().forEach(t => stream.removeTrack(t));
            stream.addTrack(audio.getAudioTracks()[0]);
        }
    } else {
      console.log("Windows/macOS/Other Workaround.");
      stream.getAudioTracks().forEach(t => {
        const constraints = {
            ...t.getConstraints(),
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false,
            channelCount: { min: 1, ideal: 2, max: 2 },
        };

        t.applyConstraints(constraints)
          .then(() => {
            console.log("new constraints: ", track.getConstraints());
          })
          .catch(e => console.log("failed to apply constraints!", e));
      });
    }

    return stream;
};

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  setLogExtension as setLKLogExtension,
  setLogLevel as setLKLogLevel,
} from "livekit-client";

import { App } from "./App";
import { init as initRageshake } from "./settings/rageshake";
import { Initializer } from "./initializer";
import { AppViewModel } from "./state/AppViewModel";
import { globalScope } from "./state/ObservableScope";

window.setLKLogLevel = setLKLogLevel;

initRageshake().catch((e) => {
  logger.error("Failed to initialize rageshake", e);
});
setLKLogLevel("info");
setLKLogExtension((level, msg, context) => {
  // we pass a synthetic logger name of "livekit" to the rageshake to make it easier to read
  global.mx_rage_logger.log(level, "livekit", msg, context);
});

logger.info(`Element Call ${import.meta.env.VITE_APP_VERSION || "dev"}`);

const root = createRoot(document.getElementById("root")!);

let fatalError: Error | null = null;

if (!window.isSecureContext) {
  fatalError = new Error(
    "This app cannot run in an insecure context. To fix this, access the app " +
      "via a local loopback address, or serve it over HTTPS.\n" +
      "https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts",
  );
} else if (!navigator.mediaDevices) {
  fatalError = new Error("Your browser does not support WebRTC.");
}

if (fatalError !== null) {
  root.render(fatalError.message);
  throw fatalError; // Stop the app early
}

Initializer.initBeforeReact()
  .then(() => {
    root.render(
      <StrictMode>
        <App vm={new AppViewModel(globalScope)} />
      </StrictMode>,
    );
  })
  .catch((e) => {
    logger.error("Failed to initialize app", e);
    root.render(e.message);
  });
