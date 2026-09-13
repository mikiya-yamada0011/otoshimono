import locationMaster from "../data/location-master.json";

export type BuildingLocation = {
  code: string;
  name: string;
  mapNo?: string;
};

export type CampusLocation = {
  code: string;
  name: string;
  buildings: BuildingLocation[];
};

function buildingCode(campusCode: string, mapNo: string | number): string {
  return `${campusCode}_B${String(mapNo).padStart(3, "0").replaceAll("-", "_")}`;
}

/** 神戸大学公式キャンパスマップを基準にした拾得場所マスタ。 */
export const CAMPUSES: CampusLocation[] = locationMaster.campuses.map((campus) => ({
  code: campus.code,
  name: campus.name,
  buildings: [
    ...campus.locations.map((location) => ({
      code: buildingCode(campus.code, location.mapNo),
      name: location.name,
      mapNo: String(location.mapNo),
    })),
    { code: `${campus.code}_OUTDOOR`, name: "屋外・通路・広場" },
    { code: `${campus.code}_OTHER`, name: "その他・不明" },
  ],
}));

const campusByCode = new Map(CAMPUSES.map((campus) => [campus.code, campus]));
const buildingByCode = new Map(
  CAMPUSES.flatMap((campus) =>
    campus.buildings.map((building) => [building.code, building] as const),
  ),
);

const legacyCampusByPlace: Record<string, string> = {
  農学部: "C02",
  工学部: "C02",
  理学部: "C02",
  文学部: "C02",
};

export function getCampus(code?: string): CampusLocation | undefined {
  return code ? campusByCode.get(code) : undefined;
}

export function getBuilding(code?: string): BuildingLocation | undefined {
  return code ? buildingByCode.get(code) : undefined;
}

/**
 * 新形式の複合表示名と旧形式の自由記述の両方から、場所コードを補完する。
 * 建物名を特定できない旧データでは、推測できるキャンパスだけを返す。
 */
export function inferLocationCodes(place: string): {
  campusCode?: string;
  buildingCode?: string;
} {
  const normalized = place.trim();
  if (!normalized) return {};

  for (const campus of CAMPUSES) {
    const building = [...campus.buildings]
      .sort((left, right) => right.name.length - left.name.length)
      .find((candidate) => normalized.includes(candidate.name));
    if (building) {
      return { campusCode: campus.code, buildingCode: building.code };
    }
    if (
      normalized.includes(campus.name) ||
      normalized.includes(campus.name.replace("キャンパス", ""))
    ) {
      return { campusCode: campus.code };
    }
  }

  const campusCode = legacyCampusByPlace[normalized];
  return campusCode ? { campusCode } : {};
}

export function selectedLocationName(
  campusCode?: string,
  buildingCode?: string,
): string | undefined {
  return getBuilding(buildingCode)?.name ?? getCampus(campusCode)?.name;
}
