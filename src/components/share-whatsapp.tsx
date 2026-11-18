/**
 * "Share on WhatsApp": opens WhatsApp (app or web) with a ready-made message
 * and link. Works without JavaScript; nothing is sent until the person taps Send.
 */
export function ShareWhatsApp({ text, url, label = "Share on WhatsApp", className = "" }: { text: string; url: string; label?: string; className?: string }) {
  const href = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-[#1f7a4d] px-5 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-[#17603c] ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5.1 5.3-1.4A9.9 9.9 0 1 0 12.04 2zm0 18.1a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3a8.2 8.2 0 1 1 7 3.9zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.6.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.6-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2s.2-1.1.1-1.2-.2-.2-.5-.3z" />
      </svg>
      {label}
    </a>
  );
}
