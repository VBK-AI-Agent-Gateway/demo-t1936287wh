#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 产品介绍.docx（内嵌处理后的主图 clean.png）"""
import os, sys, zipfile, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "clean.png")
OUT = os.path.join(HERE, "产品介绍.docx")

NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/pic"')

def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

def p(text, style=None, bold=False, size=None, color=None, align=None, spacing=None):
    pr = []
    if style: pr.append(f'<w:pStyle w:val="{style}"/>')
    if align: pr.append(f'<w:jc w:val="{align}"/>')
    if spacing: pr.append(f'<w:spacing w:before="60" w:after="{spacing}"/>')
    pPr = f"<w:pPr>{''.join(pr)}</w:pPr>" if pr else ""
    rpr = []
    if bold: rpr.append("<w:b/>")
    if size: rpr.append(f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>')
    if color: rpr.append(f'<w:color w:val="{color}"/>')
    rPr = f"<w:rPr>{''.join(rpr)}<w:rFonts w:eastAsia=\"微软雅黑\" w:ascii=\"Calibri\" w:hAnsi=\"Calibri\"/></w:rPr>" if rpr else ""
    return f'<w:p>{pPr}<w:r>{rPr}<w:t xml:space="preserve">{esc(text)}</w:t></w:r></w:p>'

def h(text, lvl):
    return (f'<w:p><w:pPr><w:pStyle w:val="Heading{lvl}"/></w:pPr>'
            f'<w:r><w:t xml:space="preserve">{esc(text)}</w:t></w:r></w:p>')

def bullet(text):
    return p("• " + text)

def table(rows, widths):
    tw = sum(widths)
    grid = "".join(f'<w:gridCol w:w="{w}"/>' for w in widths)
    trs = []
    for i, row in enumerate(rows):
        tcs = []
        for j, cell in enumerate(row):
            shd = '<w:shd w:fill="EEF2F7" w:val="clear"/>' if i == 0 else ''
            b = '<w:b/>' if i == 0 else ''
            tcs.append(
                f'<w:tc><w:tcPr><w:tcW w:w="{widths[j]}" w:type="dxa"/>{shd}</w:tcPr>'
                f'<w:p><w:r><w:rPr>{b}<w:rFonts w:eastAsia="微软雅黑"/></w:rPr>'
                f'<w:t xml:space="preserve">{esc(cell)}</w:t></w:r></w:p></w:tc>')
        trs.append(f"<w:tr>{''.join(tcs)}</w:tr>")
    return (f'<w:tbl><w:tblPr><w:tblW w:w="{tw}" w:type="dxa"/>'
            f'<w:tblBorders>'
            + "".join(f'<w:{s} w:val="single" w:sz="4" w:color="C9D1DB"/>'
                      for s in ("top", "left", "bottom", "right", "insideH", "insideV"))
            + f'</w:tblBorders></w:tblPr><w:tblGrid>{grid}</w:tblGrid>{"".join(trs)}</w:tbl>')

def drawing(rid, cx, cy, name):
    return (f'<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>'
            f'<wp:inline distT="0" distB="0" distL="0" distR="0">'
            f'<wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="1" name="{name}"/>'
            f'<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
            f'<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="{name}"/><pic:cNvPicPr/></pic:nvPicPr>'
            f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
            f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
            f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
            f'</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>')

# ---------------- 内容 ----------------
body = []
body.append(p("产品介绍", style="Title"))
body.append(p("便携保温杯 500ml · 316L 不锈钢内胆", size=24, color="5A6472", align="center"))
body.append(drawing("rId1", 5400000, 4050000, "产品主图"))
body.append(p("图 1：产品主图（已去除促销文字与红色装饰元素）", size="18", color="8A93A0", align="center"))

body.append(h("一、产品概述", 1))
body.append(p("本产品为 500ml 便携保温杯，内胆采用 316L 医用级不锈钢，一体拉伸成型、无焊缝，"
              "抗腐蚀、不易挂壁留味。杯身经喷砂+烤漆双层工艺处理，触感细腻且耐指纹。"
              "搭配一键弹盖与安全锁扣，适合通勤、驾车、户外与办公场景随身携带。"))

body.append(h("二、核心卖点", 1))
for t in [
    "长效保温：6 真空隔热层结构，沸水注入 12 小时后仍可保持 60℃ 以上。",
    "食品级安全：316L 内胆 + 食品级硅胶密封圈，无涂层、无异味，可盛装咖啡、茶饮与碳酸饮料。",
    "防漏设计：双胶圈旋紧结构，倒置摇晃不漏水，可放心放入背包侧袋。",
    "便携轻量：整杯净重约 290g，杯身直径 70mm，适配绝大多数车载杯架。",
    "易清洁：广口设计（口径 55mm），手可直接伸入清洗，杯盖可完全拆解。",
]:
    body.append(bullet(t))

body.append(h("三、规格参数", 1))
body.append(table([
    ["参数", "规格"],
    ["容量", "500 ml"],
    ["内胆材质", "316L 不锈钢"],
    ["外形材质", "304 不锈钢（喷砂烤漆）"],
    ["保温性能", "≥ 12 小时（60℃ 以上）"],
    ["密封件", "食品级硅胶"],
    ["净重", "约 290 g"],
    ["尺寸", "直径 70 mm × 高 220 mm"],
    ["颜色", "曜石黑 / 雾灰白 / 松石绿"],
    ["包装", "独立彩盒 + 气泡袋（可定制外箱）"],
], [3000, 6000]))

body.append(h("四、适用场景", 1))
body.append(p("通勤办公、自驾出行、户外徒步、健身训练、校园使用；亦可作为企业礼品、活动赠品进行 "
              "Logo 定制（支持激光雕刻与丝印两种工艺）。"))

body.append(h("五、生产与服务", 1))
for t in [
    "自有产线：注塑、焊接、喷涂、包装全工序自制，品质可追溯。",
    "柔性定制：支持 Logo、颜色、包装、刻字图案的 OEM/ODM 定制。",
    "品控体系：出厂前逐批抽检保温性能与密封性，合格率标准 ≥ 99.5%。",
    "供货能力：常规款式现货充足，定制单交期 15–25 天。",
    "售后承诺：非人为损坏一年内质保，运输破损全权负责补发。",
]:
    body.append(bullet(t))

body.append(p("（本页面图片已按要求去除“源头工厂”字样与红色促销元素。）",
              size="18", color="8A93A0"))

document_xml = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document {NS}><w:body>{"".join(body)}'
                f'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
                f'<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" '
                f'w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
                f'</w:body></w:document>')

styles_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="微软雅黑" w:cs="Arial"/>
<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/>
</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>
<w:pPr><w:spacing w:before="0" w:after="120"/><w:jc w:val="center"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="56"/><w:szCs w:val="56"/><w:color w:val="1F2733"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
<w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="1F2733"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
<w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="33405A"/></w:rPr></w:style>
</w:styles>'''

content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>'''

root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>'''

doc_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''

now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
core = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>产品介绍 - 便携保温杯 500ml</dc:title><dc:creator>Product Team</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified>
</cp:coreProperties>'''

app = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>pi-agent</Application></Properties>'''

with open(IMG, "rb") as f:
    img_bytes = f.read()

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", root_rels)
    z.writestr("word/document.xml", document_xml)
    z.writestr("word/styles.xml", styles_xml)
    z.writestr("word/_rels/document.xml.rels", doc_rels)
    z.writestr("word/media/image1.png", img_bytes)
    z.writestr("docProps/core.xml", core)
    z.writestr("docProps/app.xml", app)

# 校验
with zipfile.ZipFile(OUT) as z:
    bad = z.testzip()
    names = z.namelist()
print("OK:", OUT)
print("entries:", len(names), "bad:", bad)
print("\n".join(" - " + n for n in names))