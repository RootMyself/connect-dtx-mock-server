import {
  normalizeOrgAddress,
  normalizeOrgName,
  normalizeOrgPhone,
  normalizeOrgPostal,
} from "./organizations.ts";

// /phicode 발급 폼의 병원 드롭다운 단일 소스. 값은 그대로 입력칸에 채워지고
// 서버가 정규화하므로 phone은 표시형(하이픈 포함)으로 둔다.
export interface HospitalPreset {
  name: string;
  address: string;
  postal: string;
  phone: string;
}

export const HOSPITAL_PRESETS: readonly HospitalPreset[] = [
  {
    name: "서울대학교병원",
    address: "서울특별시 종로구 대학로 101",
    postal: "03080",
    phone: "02-2072-2114",
  },
  {
    name: "세브란스병원",
    address: "서울특별시 서대문구 연세로 50-1",
    postal: "03722",
    phone: "02-2228-2114",
  },
  {
    name: "서울아산병원",
    address: "서울특별시 송파구 올림픽로43길 88",
    postal: "05505",
    phone: "02-3010-3114",
  },
  {
    name: "삼성서울병원",
    address: "서울특별시 강남구 일원로 81",
    postal: "06351",
    phone: "02-3410-2114",
  },
  {
    name: "서울성모병원",
    address: "서울특별시 서초구 반포대로 222",
    postal: "06591",
    phone: "02-2258-2114",
  },
  {
    name: "고대안암병원",
    address: "서울특별시 성북구 고려대로 73",
    postal: "02841",
    phone: "02-920-5114",
  },
  {
    name: "테스트병원",
    address: "서울특별시 테스트구",
    postal: "00000",
    phone: "02-0000-0000",
  },
];

export function isValidPreset(preset: HospitalPreset): boolean {
  return (
    normalizeOrgName(preset.name) !== undefined &&
    normalizeOrgAddress(preset.address) !== undefined &&
    normalizeOrgPostal(preset.postal) !== undefined &&
    normalizeOrgPhone(preset.phone) !== undefined
  );
}
