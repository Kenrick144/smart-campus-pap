"use client";

import { BrowserQRCodeReader } from "@zxing/browser";
import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

export function QrImage({ value }: { value: string }) {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: 96, margin: 1, errorCorrectionLevel: "M" })
      .then((dataUrl) => {
        if (active) setImage(dataUrl);
      })
      .catch((cause: unknown) => {
        console.error("Não foi possível gerar a imagem do código QR.", cause);
        if (active) setError("QR indisponível");
      });
    return () => { active = false; };
  }, [value]);

  if (error) return <small role="status">{error}</small>;
  return image ? <Image className="qr-preview" src={image} alt={`Código QR ${value}`} width={48} height={48} unoptimized /> : <span className="qr-preview-placeholder" aria-label="A gerar código QR" />;
}

export function QrScanner({ onDetected }: { onDetected: (value: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!isOpen || !videoRef.current) return;

    let active = true;
    let controls: { stop: () => void } | undefined;
    const reader = new BrowserQRCodeReader();
    reader.decodeFromVideoDevice(undefined, videoRef.current, (result, _error, scannerControls) => {
      controls = scannerControls;
      if (!result || !active) return;
      active = false;
      scannerControls.stop();
      setIsOpen(false);
      onDetectedRef.current(result.getText());
    }).then((scannerControls) => {
      controls = scannerControls;
      if (!active) scannerControls.stop();
    }).catch((cause: unknown) => {
      if (!active) return;
      console.error("Não foi possível iniciar a câmara para ler o código QR.", cause);
      setError(cause instanceof Error ? cause.message : "Verifique as permissões da câmara e tente novamente.");
      setIsOpen(false);
    });

    return () => {
      active = false;
      controls?.stop();
    };
  }, [isOpen]);

  return <div className="qr-scanner">
    <button type="button" className="button button-secondary" onClick={() => { setError(""); setIsOpen((open) => !open); }}>
      {isOpen ? "Fechar câmara" : "Ler com a câmara"}
    </button>
    {isOpen && <video ref={videoRef} className="qr-video" muted playsInline aria-label="Pré-visualização da câmara para ler o QR" />}
    {error && <p className="qr-error" role="alert">{error}. A câmara requer permissão do navegador e uma ligação HTTPS ou localhost.</p>}
  </div>;
}
