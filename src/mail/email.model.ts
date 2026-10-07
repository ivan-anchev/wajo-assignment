import { z } from "zod";

export const emailFileSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  from: z.email(),
  to: z.email(),
  subject: z.string(),
  body: z.string(),
  headers: z.record(z.string(), z.string()),
  receivedAt: z.iso.datetime(),
});
export type EmailFile = z.infer<typeof emailFileSchema>;

export type SenderClass = "internal" | "known" | "newsletter" | "first_contact";

export type Email = EmailFile & { senderClass: SenderClass };

export type EmailState = {
  archivedAt: string | null;
  readAt: string | null;
  snoozedUntil: string | null;
  labels: string[];
};
