import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

/**
 * Camera fallback for when there is no handheld scanner to hand — a phone, a
 * tablet, or a laptop at a pop-up stall.
 *
 * Purely additive: the "type + Enter" path that real USB scanners use is
 * untouched, and this never becomes the primary route because a camera decode
 * is far slower than a beam.
 */
const CameraBarcodeScanDialog: React.FC<Props> = ({ open, onClose, onDetected }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");

  /**
   * Enumerate cameras when the dialog opens.
   *
   * Device labels stay blank until camera permission has been granted at least
   * once, so a throwaway stream is requested purely to unlock the labels —
   * without them the picker below would show "Camera 1 / Camera 2" and the user
   * could not tell which is which.
   */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        let list = await navigator.mediaDevices.enumerateDevices();
        let videoInputs = list.filter((d) => d.kind === "videoinput");

        if (videoInputs.some((d) => !d.label)) {
          const temp = await navigator.mediaDevices.getUserMedia({ video: true });
          temp.getTracks().forEach((t) => t.stop());
          list = await navigator.mediaDevices.enumerateDevices();
          videoInputs = list.filter((d) => d.kind === "videoinput");
        }

        if (cancelled) return;
        setDevices(videoInputs);

        // Many Windows Hello laptops expose two cameras: a normal RGB webcam
        // and an infrared one used only for face login. The infrared feed looks
        // solid black under normal light, so picking the browser's default can
        // silently give a dead preview. Skip anything that names itself IR.
        const preferred =
          videoInputs.find((d) => !/infrared|ir camera|\bir\b/i.test(d.label)) ??
          videoInputs[0];

        setDeviceId((prev) => prev || preferred?.deviceId || "");
      } catch {
        // Permission or enumeration failed. The decode effect below surfaces a
        // proper message once it tries to open a stream.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    (async () => {
      try {
        const controls = await reader.decodeFromVideoDevice(
          deviceId || undefined,
          videoRef.current ?? undefined,
          (result) => {
            if (cancelled || !result) return;

            const text = result.getText();
            if (text) {
              // Stop before handing the code over: without this the camera
              // keeps decoding the same label and fires repeatedly, adding the
              // item several times.
              controlsRef.current?.stop();
              onDetected(text);
            }
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? `Could not start the camera: ${err.message}`
            : "Could not start the camera."
        );
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, deviceId, onDetected]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Scan with the camera</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        {devices.length > 1 ? (
          <TextField
            select
            fullWidth
            size="small"
            label="Camera"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            helperText="If the preview is black, try the other camera."
            sx={{ mb: 2 }}
          >
            {devices.map((d, index) => (
              <MenuItem key={d.deviceId} value={d.deviceId}>
                {d.label || `Camera ${index + 1}`}
              </MenuItem>
            ))}
          </TextField>
        ) : null}

        <Box
          sx={{
            position: "relative",
            bgcolor: "#000000",
            borderRadius: 1,
            overflow: "hidden",
            aspectRatio: "4 / 3",
          }}
        >
          <video
            ref={videoRef}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            muted
            playsInline
          />
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
          Hold the barcode steady, filling about half the frame. A handheld
          scanner is much faster if you have one.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CameraBarcodeScanDialog;
