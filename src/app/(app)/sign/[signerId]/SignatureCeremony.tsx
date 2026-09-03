"use client";

import { useActionState, useRef, useState } from "react";

import { signLocallyAction } from "../actions";
import type { ActionState } from "../../actions";

// Cérémonie de signature locale : le document est lu au-dessus, ici on
// recueille le nom, un tracé (facultatif) et le consentement exprès.
export function SignatureCeremony({
  signerId,
  defaultName,
  consentText,
}: {
  signerId: string;
  defaultName: string;
  consentText: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(signLocallyAction, undefined);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  // Ref (pas seulement un état) : la soumission peut suivre le dernier trait
  // avant tout re-rendu, et doit quand même capturer le tracé.
  const strokeRef = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    const p = pos(e);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointeur inconnu (événement synthétique) : on trace quand même
    }
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    strokeRef.current = true;
    if (!hasStroke) setHasStroke(true);
  }
  function up() {
    drawing.current = false;
  }
  function clear() {
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    strokeRef.current = false;
    setHasStroke(false);
  }
  function onSubmit() {
    if (imageRef.current) {
      imageRef.current.value =
        strokeRef.current && canvasRef.current ? canvasRef.current.toDataURL("image/png") : "";
    }
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground dark:border-white/20";

  return (
    <form action={action} onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="signerId" value={signerId} />
      <input ref={imageRef} type="hidden" name="signatureImage" />

      <div>
        <label htmlFor="signedName" className="block text-sm font-medium">
          Votre nom complet
        </label>
        <input id="signedName" name="signedName" required minLength={2} defaultValue={defaultName} className={inputCls} />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Votre signature <span className="text-black/40 dark:text-white/40">(tracé, facultatif)</span></span>
          <button type="button" onClick={clear} className="text-xs underline">
            Effacer
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="mt-1 w-full touch-none rounded-lg border border-dashed border-black/20 bg-white dark:border-white/25"
          aria-label="Zone de signature"
        />
      </div>

      <label className="flex items-start gap-2 text-xs text-black/70 dark:text-white/70">
        <input type="checkbox" name="consent" required className="mt-0.5" />
        <span>{consentText}</span>
      </label>

      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Signature en cours…" : "Signer électroniquement"}
      </button>
    </form>
  );
}
