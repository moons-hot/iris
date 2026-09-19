/**
 * Prints the provisioning values for each demo Iris Key.
 *
 * Usage: pnpm device:secrets
 */
import { SEED_DEVICES, SEED_USERS } from "@/server/iris/seed-data";

console.log("Iris Key provisioning values (synthetic demo credentials)\n");

for (const device of SEED_DEVICES) {
  const user = SEED_USERS.find((entry) => entry.id === device.userId);
  console.log(`${device.id}  ->  ${user?.fullName ?? "unknown"} (${user?.role ?? "?"})`);
  console.log(`  secret: ${device.secretHex}`);
  console.log(
    `  provision line: {"cmd":"PROVISION","deviceId":"${device.id}","secret":"${device.secretHex}"}`,
  );
  console.log("");
}

console.log(
  "Flash IRIS-0042 to the physician board and IRIS-ENGINEER-07 to the engineer board.",
);
