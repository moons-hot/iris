import { searchPopulationContext } from "../src/server/iris/population-context.ts";

async function main() {
  const pop = await searchPopulationContext(
    "patient being evaluated for hypertension",
  );
  console.log(
    JSON.stringify(
      {
        status: pop.status,
        reason: pop.reason,
        matched: pop.matchedContexts,
        source: pop.retrievalSource,
        obs: pop.observations.slice(0, 4),
        meds: pop.medications.slice(0, 4),
        conditions: pop.conditions.slice(0, 4),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
