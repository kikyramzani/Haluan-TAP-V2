"use client";

import { useState } from "react";
import Icon from "../components/Icon";

export default function ShareDealButton({ brand }: { brand: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    const data = {
      title: `${brand} · TAP by Haluan`,
      text: `Lihat link campaign ${brand}, pilihan etalase, dan request sample di TAP by Haluan.`,
      url,
    };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    }
  }

  return <button className="share-deal-button" type="button" onClick={() => void share()}>{copied ? <>Link TAP tersalin <Icon name="check" /></> : "Bagikan halaman TAP"}<Icon name="arrow-up-right" /></button>;
}
