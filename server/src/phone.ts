export const normalizePhoneNumber = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const hasPlusPrefix = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  if (hasPlusPrefix) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0")) return `+49${digits.slice(1)}`;
  if (digits.startsWith("49")) return `+${digits}`;
  return `+${digits}`;
};
