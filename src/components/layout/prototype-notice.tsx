/** Hoiatusriba, mis on nähtav seni, kuni pood töötab testandmetega (admin → Seaded → Pood → prototüübirežiim). */
export function PrototypeNotice() {
  return (
    <div role="note" className="bg-text px-4 py-2 text-center text-xs text-white">
      <strong className="font-semibold">Prototüüp:</strong> tooted, hinnad ja laoseisud on arenduse testandmed. Tellimusi
      veel vastu ei võeta.
    </div>
  );
}
