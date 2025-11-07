import json

# ✅ 1. product.json 불러오기
with open("product.json", "r", encoding="utf-8") as f:
    data = json.load(f)

# ✅ 2. '원재료'가 존재하고 리스트 형태인 항목만 필터링
valid_items = [item for item in data if isinstance(item.get("원재료명"), list)]

# ✅ 3. 원재료 개수가 가장 많은 상품 찾기
max_item = max(valid_items, key=lambda x: len(x["원재료명"]))

# ✅ 4. 정보 출력
print(f"📦 상품명: {max_item.get('제품명', '이름 없음')}")
print(f"📊 원재료 개수: {len(max_item['원재료명'])}")
print("🥕 원재료 목록:")
print("\n".join(max_item['원재료명']))
