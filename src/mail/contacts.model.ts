import { z } from "zod";

export const contactsSchema = z.object({ me: z.email(), contacts: z.array(z.email()) });
export type Contacts = z.infer<typeof contactsSchema>;
