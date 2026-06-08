"use client";

import { useState } from "react";
import { getImageUrl } from "@/lib/utils";

type ProjectImageProps = {
  src?: string | null;
  name: string;
  variant: "cover" | "logo";
};

export function ProjectImage({ src, name, variant }: ProjectImageProps) {
  const [failed, setFailed] = useState(false);
  const imageUrl = !failed ? getImageUrl(src) : "";

  if (variant === "cover") {
    return imageUrl ? (
      <img
        src={imageUrl}
        alt=""
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#0052ff,#061022_58%,#7dd3fc)] px-4 text-center text-xl font-black text-white">
        {name}
      </div>
    );
  }

  return imageUrl ? (
    <img
      src={imageUrl}
      alt={`${name} logo`}
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  ) : (
    <span>{name.slice(0, 1).toUpperCase()}</span>
  );
}
