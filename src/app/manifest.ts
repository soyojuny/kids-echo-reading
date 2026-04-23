import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kids Echo Reading",
    short_name: "Echo Reading",
    description: "Tablet-first echo reading training app for children.",
    start_url: "/library",
    display: "standalone",
    orientation: "any",
    background_color: "#f6f9ff",
    theme_color: "#164b9f",
    icons: [
      {
        src: "/icon.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any"
      },
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any"
      }
    ]
  };
}
