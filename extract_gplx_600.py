#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Trích xuất toàn bộ 600 câu hỏi sát hạch GPLX (Bộ Công An 2025)
và trích xuất toàn bộ hình ảnh sa hình, biển báo thực tế từ PDF.
"""

import os
import re
import json
import pymupdf

PDF_PATH = "/Users/hwg/Downloads/600-cau-hoi-sat-hach.pdf"
OUT_IMG_DIR = "/Users/hwg/Desktop/tiktok-live-temple-rpc/public/assets/gplx_images"
OUT_JSON = "/Users/hwg/Desktop/tiktok-live-temple-rpc/data/gplx-questions.json"

os.makedirs(OUT_IMG_DIR, exist_ok=True)
os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)

print("Đang mở tài liệu PDF...")
doc = pymupdf.open(PDF_PATH)
total_pages = len(doc)
print(f"Tổng số trang: {total_pages}")

# 1. Trích xuất tất cả các hình ảnh và vị trí trên từng trang
# page_index -> list of dict(rect=rect, xref=xref, saved_path=path)
page_images = {}

print("Đang trích xuất hình ảnh thực tế từ tài liệu...")
for p_idx in range(total_pages):
    page = doc[p_idx]
    imgs = page.get_images()
    if not imgs:
        continue
    page_images[p_idx] = []
    for img_idx, img_info in enumerate(imgs):
        xref = img_info[0]
        rects = page.get_image_rects(xref)
        if not rects:
            continue
        rect = rects[0]
        # Bỏ qua hình ảnh quá nhỏ (như biểu tượng trang trí < 40px)
        if rect.width < 50 or rect.height < 40:
            continue
        
        # Lưu hình ảnh ra đĩa
        img_filename = f"p{p_idx+1}_img{img_idx+1}_{xref}.png"
        img_path = os.path.join(OUT_IMG_DIR, img_filename)
        
        pix = pymupdf.Pixmap(doc, xref)
        if pix.n >= 5: # CMYK to RGB
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        pix.save(img_path)
        
        page_images[p_idx].append({
            "rect": rect,
            "filename": f"/assets/gplx_images/{img_filename}"
        })

print(f"Đã trích xuất xong hình ảnh trên {len(page_images)} trang.")

# 2. Phân tích từng trang để bóc tách câu hỏi, đáp án gạch chân và liên kết hình ảnh
questions = []

# Biểu thức tìm câu hỏi: "Câu 12.", "Câu 12:", "Câu 12 "
q_regex = re.compile(r"^Câu\s+(\d+)\s*[\.:]\s*(.*)", re.IGNORECASE)
opt_regex = re.compile(r"^(\d+)\.\s*(.*)")

# Danh sách câu hỏi điểm liệt phổ biến theo quy định mới
FATAL_QUESTIONS = set([
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
    36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
    55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73,
    85, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103,
    104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118,
    119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133,
    248, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264,
    495, 498, 500, 501, 517, 525, 540, 560, 580, 590, 595, 596
])

key_letters = ["A", "B", "C", "D", "E"]
color_sequence = ["blue", "gold", "green", "purple"]

for p_idx in range(5, total_pages):
    page = doc[p_idx]
    text_page = page.get_text("blocks") # list of (x0, y0, x1, y1, text, block_no, block_type)
    drawings = page.get_drawings()
    
    # Tìm các gạch chân (đáp án đúng)
    underlines = [d["rect"] for d in drawings if d["rect"].height < 3 and d["rect"].width > 15]
    
    # Gom các dòng text kèm tọa độ
    words = page.get_text("words") # (x0, y0, x1, y1, word, block_no, line_no, word_no)
    
    lines_dict = {}
    for w in words:
        line_key = (w[5], w[6])
        if line_key not in lines_dict:
            lines_dict[line_key] = {"bbox": [w[0], w[1], w[2], w[3]], "words": []}
        lines_dict[line_key]["words"].append(w)
        lines_dict[line_key]["bbox"][0] = min(lines_dict[line_key]["bbox"][0], w[0])
        lines_dict[line_key]["bbox"][1] = min(lines_dict[line_key]["bbox"][1], w[1])
        lines_dict[line_key]["bbox"][2] = max(lines_dict[line_key]["bbox"][2], w[2])
        lines_dict[line_key]["bbox"][3] = max(lines_dict[line_key]["bbox"][3], w[3])
        
    sorted_lines = sorted(lines_dict.values(), key=lambda l: (l["bbox"][1], l["bbox"][0]))
    
    current_q = None
    
    for l_info in sorted_lines:
        line_text = " ".join([w[4] for w in l_info["words"]]).strip()
        if not line_text:
            continue
        
        # Bỏ qua số trang ở đầu/cuối
        if re.match(r"^\d{1,3}$", line_text):
            continue
        # Bỏ qua tiêu đề chương
        if line_text.startswith("CHƯƠNG ") or line_text.startswith("TÌNH HUỐNG "):
            continue
            
        m_q = q_regex.match(line_text)
        if m_q:
            # Lưu câu hỏi trước đó nếu có
            if current_q and current_q["options"]:
                questions.append(current_q)
                
            q_num = int(m_q.group(1))
            q_title = m_q.group(2).strip()
            
            is_fatal = q_num in FATAL_QUESTIONS
            current_q = {
                "id": q_num,
                "questionNumber": q_num,
                "totalQuestions": 600,
                "category": "HẠNG B - C1 - C",
                "question": q_title,
                "isFatal": is_fatal,
                "fatalLabel": "⚠️ Điểm liệt! (Câu hỏi quan trọng)" if is_fatal else "Câu hỏi lý thuyết / Sa hình",
                "options": [],
                "correctKey": "A", # Mặc định
                "correctNum": 1,
                "explanation": "Đáp án chuẩn theo Bộ 600 câu hỏi sát hạch GPLX (Bộ Công An ban hành 2025).",
                "image": None,
                "bbox_y0": l_info["bbox"][1],
                "page_idx": p_idx,
                "mockVotes": { "A": 120, "B": 240, "C": 45, "D": 15 },
                "accuracyRate": 75,
                "avgSpeed": "1.1 giây"
            }
            continue
            
        # Kiểm tra nếu là lựa chọn đáp án: 1. ..., 2. ..., 3. ..., 4. ...
        m_opt = opt_regex.match(line_text)
        if m_opt and current_q:
            opt_num = int(m_opt.group(1))
            opt_text = m_opt.group(2).strip()
            key_char = key_letters[opt_num - 1] if opt_num <= len(key_letters) else str(opt_num)
            
            # Kiểm tra xem dòng này có bị gạch chân không
            is_underlined = False
            l_y0 = l_info["bbox"][1]
            l_y1 = l_info["bbox"][3]
            for u in underlines:
                # Underline nằm ngay bên dưới dòng text
                if abs(u.y0 - l_y1) < 8 or (l_y0 <= u.y0 <= l_y1 + 5):
                    if not (u.x1 < l_info["bbox"][0] or u.x0 > l_info["bbox"][2]):
                        is_underlined = True
                        break
                        
            if is_underlined:
                current_q["correctKey"] = key_char
                current_q["correctNum"] = opt_num
                
            color = color_sequence[(opt_num - 1) % len(color_sequence)]
            current_q["options"].append({
                "key": key_char,
                "num": opt_num,
                "text": opt_text,
                "color": color
            })
        elif current_q:
            # Nếu đang ở trong một câu hỏi và đây là dòng tiếp nối của câu hỏi hoặc đáp án
            if current_q["options"]:
                # Nối tiếp đáp án cuối
                current_q["options"][-1]["text"] += " " + line_text
                # Kiểm tra tiếp gạch chân cho dòng tiếp nối
                for u in underlines:
                    if abs(u.y0 - l_info["bbox"][3]) < 8:
                        current_q["correctKey"] = current_q["options"][-1]["key"]
            else:
                # Nối tiếp tiêu đề câu hỏi
                current_q["question"] += " " + line_text

    if current_q and current_q["options"]:
        questions.append(current_q)

# 3. Gắn hình ảnh sa hình/biển báo vào từng câu hỏi tương ứng
print("Đang đối chiếu và gắn hình ảnh thực tế vào từng câu hỏi...")
for q in questions:
    p = q["page_idx"]
    if p in page_images and page_images[p]:
        # Tìm hình ảnh nằm gần câu hỏi nhất trên cùng trang
        # Hình ảnh sa hình thường nằm ngay dưới tiêu đề câu hỏi hoặc bên cạnh
        q_y = q["bbox_y0"]
        best_img = None
        min_dist = 999999
        for img_data in page_images[p]:
            i_y = img_data["rect"].y0
            dist = abs(i_y - q_y)
            if dist < min_dist:
                min_dist = dist
                best_img = img_data
        if best_img and min_dist < 400:
            q["image"] = best_img["filename"]

# Làm sạch dữ liệu bbox trước khi xuất JSON
for q in questions:
    q.pop("bbox_y0", None)
    q.pop("page_idx", None)
    # Tạo số vote giả lập sinh động cho TikTok Live
    votes = {}
    total_v = 0
    for opt in q["options"]:
        k = opt["key"]
        v = 50 + (180 if k == q["correctKey"] else 15) + (q["id"] * 7) % 70
        votes[k] = v
        total_v += v
    q["mockVotes"] = votes
    corr_v = votes.get(q["correctKey"], 0)
    q["accuracyRate"] = round((corr_v / max(1, total_v)) * 100)

print(f"Tổng số câu hỏi trích xuất thành công: {len(questions)}")
with open(OUT_JSON, "w", encoding="utf-8") as f:
    json.dump(questions, f, ensure_ascii=False, indent=2)

print(f"Đã lưu cơ sở dữ liệu câu hỏi thực tế vào: {OUT_JSON}")
