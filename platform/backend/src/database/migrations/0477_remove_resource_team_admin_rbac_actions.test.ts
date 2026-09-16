import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import db, { schema } from "@/database";
import { describe, expect, test } from "@/test";

const migrationSql = fs.readFileSync(
  path.join(__dirname, "0477_remove_resource_team_admin_rbac_actions.sql"),
  "utf-8",
);

async function runMigration() {
  const statements = migrationSql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  if (statements.length === 0) {
    throw new Error("Migration statement not found");
  }

  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}

async function insertRole(params: {
  organizationId: string;
  roleId: string;
  roleName: string;
  permission: Record<string, string[]>;
}) {
  await db.insert(schema.organizationRolesTable).values({
    id: params.roleId,
    organizationId: params.organizationId,
    role: params.roleName,
    name: params.roleName,
    permission: JSON.stringify(params.permission),
  });
}

async function getRolePermission(
  roleId: string,
): Promise<Record<string, string[]>> {
  const [role] = await db
    .select({ permission: schema.organizationRolesTable.permission })
    .from(schema.organizationRolesTable)
    .where(sql`${schema.organizationRolesTable.id} = ${roleId}`);

  return JSON.parse(role.permission);
}

describe("0477 migration: remove resource team-admin RBAC actions", () => {
  test("removes team-admin while preserving other actions across multiple resources", async ({
    makeOrganization,
  }) => {
    const org = await makeOrganization();
    await insertRole({
      organizationId: org.id,
      roleId: "test-remove-resource-team-admin",
      roleName: "test_remove_resource_team_admin",
      permission: {
        agent: ["read", "create", "update", "team-admin"],
        skill: ["read", "team-admin"],
        app: ["read"],
      },
    });

    await runMigration();

    const permission = await getRolePermission("test-remove-resource-team-admin");
    expect(permission.agent).toEqual(["read", "create", "update"]);
    expect(permission.skill).toEqual(["read"]);
    expect(permission.app).toEqual(["read"]);
  });

  test("drops the resource key when team-admin was the only action", async ({
    makeOrganization,
  }) => {
    const org = await makeOrganization();
    await insertRole({
      organizationId: org.id,
      roleId: "test-remove-empty-key",
      roleName: "test_remove_empty_key",
      permission: {
        mcpGateway: ["team-admin"],
        agent: ["read"],
      },
    });

    await runMigration();

    const permission = await getRolePermission("test-remove-empty-key");
    expect(permission.mcpGateway).toBeUndefined();
    expect(permission.agent).toEqual(["read"]);
  });

  test("leaves roles without team-admin unchanged", async ({
    makeOrganization,
  }) => {
    const org = await makeOrganization();
    await insertRole({
      organizationId: org.id,
      roleId: "test-preserve-without-team-admin",
      roleName: "test_preserve_without_team_admin",
      permission: {
        agent: ["read", "create"],
        skill: ["read"],
      },
    });

    await runMigration();

    const permission = await getRolePermission(
      "test-preserve-without-team-admin",
    );
    expect(permission.agent).toEqual(["read", "create"]);
    expect(permission.skill).toEqual(["read"]);
  });
});
