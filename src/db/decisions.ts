import type { Database as Db } from "better-sqlite3";
import type { Analysis, InjectionVerdict, LearnedLevel, Level } from "../domain/policy.ts";

export type Decision = {
  id: number;
  emailId: string;
  // Null when the judge suspected an injection: a suspected email is never analyzed.
  analysis: Analysis | null;
  injection: InjectionVerdict;
  floor: Level;
  learned: LearnedLevel;
  brake: boolean;
  pin: Level | null;
  level: Level;
  createdAt: string;
};

type DecisionRow = Omit<Decision, "analysis" | "injection" | "brake"> & {
  analysis: string | null;
  injection: string;
  brake: 0 | 1;
};

const COLUMNS =
  "id, email_id AS emailId, analysis, injection, floor, learned, brake, pin, level, created_at AS createdAt";

export class Decisions {
  constructor(private readonly db: Db) {}

  insert(decision: Omit<Decision, "id" | "createdAt">): Decision {
    const row = this.db
      .prepare<[object], DecisionRow>(
        `INSERT INTO decisions (email_id, analysis, injection, floor, learned, brake, pin, level)
         VALUES (@emailId, @analysis, @injection, @floor, @learned, @brake, @pin, @level) RETURNING ${COLUMNS}`,
      )
      .get({
        ...decision,
        analysis: decision.analysis && JSON.stringify(decision.analysis),
        injection: JSON.stringify(decision.injection),
        brake: decision.brake ? 1 : 0,
      })!;
    return toDecision(row);
  }

  get(id: number): Decision {
    return this.find(id)!;
  }

  find(id: number): Decision | null {
    const row = this.db
      .prepare<[number], DecisionRow>(`SELECT ${COLUMNS} FROM decisions WHERE id = ?`)
      .get(id);
    return row ? toDecision(row) : null;
  }

  findByEmail(emailId: string): Decision | null {
    const row = this.db
      .prepare<[string], DecisionRow>(`SELECT ${COLUMNS} FROM decisions WHERE email_id = ?`)
      .get(emailId);
    return row ? toDecision(row) : null;
  }

  listOpen(): Decision[] {
    return this.db
      .prepare<[], DecisionRow>(
        `SELECT ${COLUMNS} FROM decisions
         WHERE id IN (SELECT decision_id FROM items WHERE status = 'open')
         ORDER BY id`,
      )
      .all()
      .map(toDecision);
  }

  listRecent(limit: number): Decision[] {
    return this.db
      .prepare<[number], DecisionRow>(
        `SELECT * FROM (SELECT ${COLUMNS} FROM decisions ORDER BY id DESC LIMIT ?)
         ORDER BY id`,
      )
      .all(limit)
      .map(toDecision);
  }
}

function toDecision(row: DecisionRow): Decision {
  return {
    ...row,
    analysis: row.analysis && JSON.parse(row.analysis),
    injection: JSON.parse(row.injection),
    brake: row.brake === 1,
  };
}
