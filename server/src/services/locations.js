// Philippine provinces, cities and municipalities, and barangays for the address dropdowns, from
// the official PSGC dataset (psgc-areas). Loaded once, on first use, and kept in memory.

const NCR = "1300000000";
const METRO_MANILA = { code: "NCR", name: "Metro Manila" };

let index;

function load() {
  if (index) return index;
  const data = (f) => require(`psgc-areas/data/${f}.json`);
  const towns = [...data("cities"), ...data("municipalities")].map((t) => ({
    code: t.code,
    name: t.name,
    // Metro Manila's cities and Pateros have no province; they get one so every town has a parent.
    province: t.province || (t.region === NCR ? METRO_MANILA.code : null),
  }));
  const provinces = [...data("provinces").map((p) => ({ code: p.code, name: p.name })), METRO_MANILA].sort((a, b) => a.name.localeCompare(b.name));
  const byProvince = new Map();
  for (const t of towns) {
    if (!byProvince.has(t.province)) byProvince.set(t.province, []);
    byProvince.get(t.province).push({ code: t.code, name: t.name });
  }
  for (const list of byProvince.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  // Barangays belong to a city or a municipality (Manila's also to a district, ignored here).
  const byTown = new Map();
  for (const b of data("barangays")) {
    const town = b.city || b.municipality;
    if (!byTown.has(town)) byTown.set(town, []);
    byTown.get(town).push({ code: b.code, name: b.name });
  }
  for (const list of byTown.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  index = { provinces, byProvince, byTown, towns: new Map(towns.map((t) => [t.code, t])), provinceByCode: new Map(provinces.map((p) => [p.code, p])) };
  return index;
}

const provinces = () => load().provinces;
const towns = (provinceCode) => load().byProvince.get(provinceCode) || [];
const barangays = (townCode) => load().byTown.get(townCode) || [];

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
/** "City of Panabo" is also written "Panabo City" or "Panabo". */
const townNames = (name) => {
  const n = norm(name);
  const m = n.match(/^(?:island garden )?city of (.+)$/);
  return m ? [n, `${m[1]} city`, m[1]] : [n];
};

/**
 * Splits an address typed as text ("Purok 3, New Visayas, Panabo City, Davao del Norte") into the
 * dropdown values, so older addresses can be shown in the dropdowns. Parts it can't match stay in
 * `street`. Returns null codes for anything not found.
 */
function parse(address) {
  const idx = load();
  const parts = String(address || "").split(",").map((p) => p.trim()).filter(Boolean);
  const out = { province: null, town: null, barangay: null, street: "" };
  let rest = [...parts];
  const take = (match) => {
    for (let i = rest.length - 1; i >= 0; i--) {
      const hit = match(norm(rest[i]));
      if (hit) {
        rest = [...rest.slice(0, i), ...rest.slice(i + 1)];
        return hit;
      }
    }
    return null;
  };
  const province = take((p) => idx.provinces.find((x) => norm(x.name) === p));
  // Without a province, look for the town anywhere (it must be unique to count).
  const candidates = province ? towns(province.code) : [...idx.towns.values()];
  const town = take((p) => {
    const found = candidates.filter((t) => townNames(t.name).includes(p));
    return found.length === 1 ? found[0] : null;
  });
  if (town) {
    out.town = { code: town.code, name: town.name };
    const prov = idx.provinceByCode.get(province?.code || idx.towns.get(town.code)?.province);
    out.province = prov ? { code: prov.code, name: prov.name } : null;
    // "Brgy. Gredu" is barangay "Gredu"; but some are officially named "Barangay 1".
    const brgy = take((p) => barangays(town.code).find((b) => [p, p.replace(/^(barangay|brgy) /, "")].includes(norm(b.name))));
    if (brgy) out.barangay = brgy;
  } else if (province) {
    out.province = province;
  }
  out.street = rest.join(", ");
  return out;
}

module.exports = { provinces, towns, barangays, parse };
