import { useState } from "react";
import { api } from "../../api";
import type { CommandResult, PresetData } from "../../types";
import { normalizePhoneNumber } from "../../lib/phone";

export const useSender = (deviceId: number, onSent: () => void) => {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<CommandResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (
    data: PresetData,
    channel: "gprs" | "sms",
    recipient?: string
  ) => {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const body: {
        channel: "gprs" | "sms";
        data: PresetData;
        recipient?: string;
      } = { channel, data };
      if (recipient) body.recipient = normalizePhoneNumber(recipient);
      const r = await api.sendCommand(deviceId, body);
      setResult(r.results);
      window.dispatchEvent(
        new CustomEvent("teltonika-command-sent", {
          detail: { results: r.results, channel: body.channel },
        })
      );
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return { sending, result, error, send };
};
