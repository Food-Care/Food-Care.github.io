import json

# ✅ 1. product.json 불러오기
with open("product.json", "r", encoding="utf-8") as f:
    data = json.load(f)

# ✅ 2. 모든 대분류카테고리 수집 (문자열 형태)
all_cats = []

for item in data:
    cat = item.get("대분류카테고리")
    if isinstance(cat, str) and cat.strip():  # 문자열이면 추가
        all_cats.append(cat.strip())

# ✅ 3. 중복 제거 + 정렬
unique_cats = sorted(set(all_cats))

# ✅ 4. 출력
print(f"총 {len(unique_cats)}개의 고유 대분류카테고리 발견 ✅")
print("🗂 목록:")
for cat in unique_cats:
    print("-", cat)
