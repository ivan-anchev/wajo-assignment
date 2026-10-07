import type { Decision } from "../pipeline/index.ts";
import type { Db } from "./open-db.ts";

type DecisionRow = Omit<Decision, "analysis" | "injection"> & {
  analysis: string;
  injection: string;
};

const COLUMNS =
  "id, email_id AS emailId, analysis, injection, floor, level, created_at AS createdAt";

export function insertDecision(db: Db, decision: Omit<Decision, "id" | "createdAt">): Decision {
  const row = db
    .prepare<[object], DecisionRow>(
      `INSERT INTO decisions (email_id, analysis, injection, floor, level)
       VALUES (@emailId, @analysis, @injection, @floor, @level) RETURNING ${COLUMNS}`,
    )
    .get({
      ...decision,
      analysis: JSON.stringify(decision.analysis),
      injection: JSON.stringify(decision.injection),
    })!;
  return toDecision(row);
}

export function findDecisionByEmail(db: Db, emailId: string): Decision | null {
  const row = db
    .prepare<[string], DecisionRow>(`SELECT ${COLUMNS} FROM decisions WHERE email_id = ?`)
    .get(emailId);
  return row ? toDecision(row) : null;
}

function toDecision(row: DecisionRow): Decision {
  return { ...row, analysis: JSON.parse(row.analysis), injection: JSON.parse(row.injection) };
}
