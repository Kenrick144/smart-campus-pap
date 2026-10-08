import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Smart Campus",
    short_name: "Smart Campus",
    description: "Gestão escolar, presenças e equipamentos do campus.",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#f7f8fc",
    theme_color: "#6253d9",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
