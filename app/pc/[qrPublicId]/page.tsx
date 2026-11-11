import PcQrAuthorization from "./pc-qr-authorization";

export default async function PcQrPage({
  params,
}: {
  params: Promise<{ qrPublicId: string }>;
}) {
  const { qrPublicId } = await params;
  return <PcQrAuthorization qrPublicId={qrPublicId} />;
}
