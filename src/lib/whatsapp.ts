/**
 * WhatsApp "live chat" link. Set NEXT_PUBLIC_WHATSAPP_NUMBER to the business number in international
 * format (digits only, e.g. 15551234567). Returns null when it isn't configured so callers can hide the button.
 */
export function whatsappHref(message = "Hi Worldwide Vapor, I need help with an order."): string | null {
	const number = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
	if (number.length < 7) return null;
	return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
