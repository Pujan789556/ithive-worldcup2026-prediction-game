"use client";

import { useEffect, useMemo, useState } from "react";

function formatRemaining(ms: number) {
  if (ms <= 0) {
    return "Locked";
  }

  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = Math.floor((ms % 60000) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

export function Countdown({ targetIso }: { targetIso: string }) {
  const target = useMemo(() => new Date(targetIso).getTime(), [targetIso]);
  const [now, setNow] = useState(() => Date.now());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!mounted) {
    return <span>...</span>;
  }

  return <span>{formatRemaining(target - now)}</span>;
}
