require("dotenv").config();

// Required tables — run once in Insforge dashboard:
//
// CREATE TABLE pr_jobs (
//   id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   pr_number     int,
//   repo          text,
//   owner         text,
//   status        text NOT NULL,  -- 'processing' | 'fixed' | 'escalated'
//   violation_file text,
//   violation_rule text,
//   receipt       jsonb,
//   started_at    timestamptz NOT NULL DEFAULT now(),
//   finished_at   timestamptz
// );

// @insforge/sdk ships ESM-only (shared-schemas dep has no CJS export).
// Use dynamic import() from this CJS file to bridge the gap.
async function getClient() {
	if (!process.env.INSFORGE_URL || !process.env.INSFORGE_ANON_KEY) return null;
	const { createClient } = await import("@insforge/sdk");
	// ASSUMPTION: INSFORGE_URL is the full project URL (e.g. https://your-app.region.insforge.app)
	// ASSUMPTION: INSFORGE_ANON_KEY is the public anon key, never the admin accessApiKey
	return createClient({
		baseUrl: process.env.INSFORGE_URL,
		anonKey: process.env.INSFORGE_ANON_KEY,
	});
}

async function createJob({ pr, violation }) {
	const client = await getClient();
	if (!client) {
		console.log("Insforge not configured — skipping createJob.");
		return null;
	}
	const { data, error } = await client.database
		.from("pr_jobs")
		.insert({
			pr_number: pr.number,
			repo: pr.repo,
			owner: pr.owner,
			status: "processing",
			violation_file: violation?.file || null,
			violation_rule: violation?.rule || null,
			started_at: new Date().toISOString(),
		})
		.select()
		.single();

	if (error) {
		console.warn("Insforge createJob failed:", error.message);
		return null;
	}
	console.log(`Insforge job created: ${data.id}`);
	return data.id;
}

async function updateJob(insforgeJobId, fields) {
	if (!insforgeJobId) return;
	const client = await getClient();
	if (!client) return;

	const { error } = await client.database
		.from("pr_jobs")
		.update({ ...fields, finished_at: new Date().toISOString() })
		.eq("id", insforgeJobId);

	if (error) console.warn("Insforge updateJob failed:", error.message);
}

module.exports = { createJob, updateJob };
