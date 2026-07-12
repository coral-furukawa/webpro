// 慶應義塾大学「学部学則 別表12」の学部・学科（2026年7月確認）
// https://www.keio.ac.jp/ja/about/assets/data/purpose-undergraduate.pdf
export const departmentsByFaculty = {
  "文学部": ["人文社会学科"],
  "経済学部": ["経済学科"],
  "法学部": ["法律学科", "政治学科"],
  "商学部": ["商学科"],
  "医学部": ["医学科"],
  "理工学部": ["機械工学科", "電気情報工学科", "応用化学科", "物理情報工学科", "管理工学科", "数理科学科", "物理学科", "化学科", "システムデザイン工学科", "情報工学科", "生命情報学科"],
  "総合政策学部": ["総合政策学科"],
  "環境情報学部": ["環境情報学科"],
  "看護医療学部": ["看護学科"],
  "薬学部": ["薬学科", "薬科学科"],
} as const;

export type Faculty = keyof typeof departmentsByFaculty;
export const faculties = Object.keys(departmentsByFaculty) as Faculty[];
