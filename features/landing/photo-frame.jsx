"use client";

import { useState } from "react";
import Image from "next/image";

export function PhotoFrame({ src, alt, className = "", priority = false, sizes = "100vw" }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`photo-frame ${className}`.trim()}>
      {failed ? (
        <div className="photo-frame__fallback" role="img" aria-label={alt}>
          <span className="photo-frame__fallback-orb photo-frame__fallback-orb--one" />
          <span className="photo-frame__fallback-orb photo-frame__fallback-orb--two" />
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes}
          onError={() => setFailed(true)}
          className="photo-frame__image"
        />
      )}
      <span className="photo-frame__shade" aria-hidden="true" />
    </div>
  );
}
