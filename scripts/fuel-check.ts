/** Unscaled fuel check: npx vite-node scripts/fuel-check.ts [vehicle]. */
import { isVehicleId, vehicleOrder, vehicles } from '../src/data/vehicles';
import { measureFuel } from '../tests/helpers/fuel';

const selected = process.argv[2];
if (selected && !isVehicleId(selected)) throw new Error(`Unknown vehicle ${selected}`);
for (const id of selected && isVehicleId(selected) ? [selected] : vehicleOrder) {
  const t = vehicles[id].tuning;
  const result = await measureFuel(t, id === 'unimog' ? 40 : 60);
  console.log(
    `${id}: ${t.engine.fuel.tankLitres} L capacity; idle ${result.idleLitresPerHour.toFixed(2)} L/h; ` +
      `${result.litresPer100Km.toFixed(1)} L/100 km at ${result.averageKmh.toFixed(1)} km/h on level dirt, before episode scaling`,
  );
}
