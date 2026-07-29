#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
A股热点日报自动生成脚本
数据源：AkShare（同花顺概念资金流向 + 东方财富财经快讯 + 个股新闻）
用法：python stock_hotspot.py
"""

import sys
import json
import re
import time
import traceback
from datetime import datetime, date
from pathlib import Path
from functools import lru_cache

import pandas as pd
import requests
from bs4 import BeautifulSoup

try:
    import akshare as ak
    from akshare.datasets import get_ths_js
    import py_mini_racer
except ImportError:
    print("ERROR: akshare 未安装，请运行: pip install akshare")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).parent
REPORT_DIR = SCRIPT_DIR / "reports"
CONFIG_PATH = SCRIPT_DIR / "config.json"


# ── 配置 ──────────────────────────────────────────────

def load_config():
    default = {
        "top_n_concepts": 20,
        "top_n_detail_concepts": 10,
        "top_n_news_per_concept": 3,
        "top_n_global_news": 20,
        "request_delay": 0.5,
        "output_format": ["markdown", "excel"],
        "match_news_by_concept": True,
        "match_news_by_stock": True,
    }
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            default.update(json.load(f))
    return default


# ── 交易日判断 ────────────────────────────────────────

def is_trading_day():
    try:
        dates = ak.tool_trade_date_hist_sina()
        today_str = date.today().strftime("%Y-%m-%d")
        return today_str in set(dates["trade_date"].astype(str))
    except Exception:
        return True  # 查不到就当交易日处理


# ── 数据采集 ──────────────────────────────────────────

def fetch_concept_fund_flow():
    """同花顺概念资金流向（即时）"""
    print("[1/5] 获取同花顺概念资金流向...")
    df = ak.stock_fund_flow_concept(symbol="即时")
    df = df.rename(columns={
        "行业": "概念名称",
        "行业指数": "概念指数",
        "行业-涨跌幅": "涨跌幅",
        "流入资金": "流入资金",
        "流出资金": "流出资金",
        "净额": "净额",
        "公司家数": "成份股数量",
        "领涨股": "领涨股",
        "领涨股-涨跌幅": "领涨股涨跌幅",
        "当前价": "领涨股价",
    })
    for col in ["涨跌幅", "流入资金", "流出资金", "净额", "领涨股涨跌幅", "领涨股价", "概念指数", "成份股数量"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.sort_values("涨跌幅", ascending=False).reset_index(drop=True)
    print(f"  -> 获取到 {len(df)} 个概念板块")
    return df


def fetch_global_news(config):
    """东方财富全球财经快讯"""
    print("[2/5] 获取东方财富财经快讯...")
    df = ak.stock_info_global_em()
    df["发布时间"] = pd.to_datetime(df["发布时间"], errors="coerce")
    today_str = datetime.now().strftime("%Y-%m-%d")
    df = df[df["发布时间"].dt.strftime("%Y-%m-%d") == today_str].copy()
    df = df.sort_values("发布时间", ascending=False).reset_index(drop=True)
    print(f"  -> 获取到 {len(df)} 条今日新闻")
    return df


def fetch_stock_news_for_concepts(concept_stocks_map, config):
    """为前20概念的各Top3股票拉个股新闻（去重后约60只）"""
    print("[4/5] 获取概念领涨股 Top 3 新闻...")
    delay = config.get("request_delay", 0.5)
    news_per = config.get("top_n_news_per_concept", 3)

    # 去重收集所有股票
    seen_codes = set()
    stock_news_cache = {}  # {股票名称: [新闻列表]}

    all_stocks = []
    for concept, stocks in concept_stocks_map.items():
        for s in stocks:
            code = s.get("代码", "")
            name = s.get("名称", "")
            if code and code not in seen_codes:
                seen_codes.add(code)
                all_stocks.append({"概念": concept, "代码": code, "名称": name, "涨跌幅": s.get("涨跌幅")})

    total = len(all_stocks)
    print(f"  -> 共 {total} 只股票去重后待拉取")

    for i, s in enumerate(all_stocks):
        name = s["名称"]
        if name in stock_news_cache:
            continue
        try:
            time.sleep(delay)
            ndf = ak.stock_news_em(symbol=name)
            stock_news_cache[name] = ndf.head(news_per).to_dict("records")
            if (i + 1) % 10 == 0:
                print(f"  -> [{i+1}/{total}] {name}: {len(stock_news_cache[name])} 条")
        except Exception as e:
            stock_news_cache[name] = []
            print(f"  -> [{i+1}/{total}] {name}: 失败 ({e})")

    # 按概念组装结果
    result = {}
    for s in all_stocks:
        concept = s["概念"]
        if concept not in result:
            result[concept] = {"stocks": []}
        stock_entry = {
            "代码": s["代码"],
            "名称": s["名称"],
            "涨跌幅": s["涨跌幅"],
            "news": stock_news_cache.get(s["名称"], []),
        }
        result[concept]["stocks"].append(stock_entry)

    return result


def match_news_to_concepts(global_news_df, concepts_df, config):
    """用关键词将财经新闻匹配到热点概念"""
    print("[5/5] 关联热点概念与财经新闻...")
    top_n = config.get("top_n_concepts", 20)
    result = {}

    for _, row in concepts_df.head(top_n).iterrows():
        concept = row["概念名称"]
        stock = str(row["领涨股"]) if pd.notna(row["领涨股"]) else ""
        matched_rows = []

        mask = pd.Series(False, index=global_news_df.index)
        if config.get("match_news_by_concept", True) and concept:
            mask |= global_news_df["标题"].str.contains(concept, na=False)
            mask |= global_news_df["摘要"].str.contains(concept, na=False)
        if config.get("match_news_by_stock", True) and stock:
            mask |= global_news_df["标题"].str.contains(stock, na=False)
            mask |= global_news_df["摘要"].str.contains(stock, na=False)

        matched = global_news_df[mask].head(5)
        result[concept] = matched.to_dict("records")
        if len(matched) > 0:
            print(f"  -> {concept}: 匹配到 {len(matched)} 条相关新闻")

    return result


# ── 同花顺概念成份股 ────────────────────────────────────

def _get_ths_v_code():
    """生成同花顺反爬认证 token"""
    js_code = py_mini_racer.MiniRacer()
    with open(get_ths_js("ths.js"), encoding="utf-8") as f:
        js_code.eval(f.read())
    return js_code.call("v")


@lru_cache(maxsize=1)
def _get_concept_code_map():
    """获取同花顺概念名称→代码映射（带缓存 + 首页HTML兜底）"""
    code_map = {}
    try:
        df = ak.stock_board_concept_name_ths()
        code_map = dict(zip(df["name"], df["code"]))
    except Exception:
        pass

    # 兜底：从首页HTML补充 stock_board_concept_name_ths 中缺失的概念
    try:
        r = requests.get(
            "http://q.10jqka.com.cn/gn/",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=15,
        )
        for m in re.finditer(r'"platecode":"(\d+)","platename":"([^"]+)"', r.text):
            code, name = m.group(1), m.group(2)
            # 处理 unicode 转义 (\uXXXX) 和 json 转义 (\/)
            try:
                name = json.loads(f'"{name}"')
            except Exception:
                name = name.replace("\\/", "/")
            if name not in code_map:
                code_map[name] = code
    except Exception:
        pass

    return code_map


def fetch_concept_leading_stocks(concepts_df, config):
    """为每个热点概念获取成份股中涨跌幅 Top 3"""
    print("[3/5] 获取概念成份股 Top 3...")
    delay = config.get("request_delay", 0.5)
    top_n = config.get("top_n_concepts", 20)
    top_k = 3

    v_code = _get_ths_v_code()
    code_map = _get_concept_code_map()
    result = {}

    for i, (_, row) in enumerate(concepts_df.head(top_n).iterrows()):
        concept = row["概念名称"]
        concept_code = code_map.get(concept, "")

        if not concept_code:
            result[concept] = []
            continue

        try:
            if i > 0:
                time.sleep(delay)

            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Cookie": f"v={v_code}",
                "Referer": f"http://q.10jqka.com.cn/gn/detail/code/{concept_code}/",
            }
            url = f"http://q.10jqka.com.cn/gn/detail/code/{concept_code}/order/desc/page/1/ajax/1/"

            r = requests.get(url, headers=headers, timeout=15)
            soup = BeautifulSoup(r.text, "html.parser")
            tables = soup.find_all("table")

            stocks = []
            if tables:
                rows = tables[0].find_all("tr")
                # 跳过表头（row 0），数据从 row 1 开始
                for data_row in rows[1:top_k + 1]:
                    cells = data_row.find_all("td")
                    if len(cells) >= 5:
                        code = cells[1].get_text(strip=True)
                        name = cells[2].get_text(strip=True)
                        pct_str = cells[4].get_text(strip=True)
                        try:
                            pct = float(pct_str)
                        except ValueError:
                            pct = None
                        stocks.append({
                            "代码": code,
                            "名称": name,
                            "涨跌幅": pct,
                        })

            result[concept] = stocks
            if stocks:
                names = ", ".join(f"{s['名称']}({_fmt_pct(s['涨跌幅'])})" for s in stocks)
                print(f"  -> {concept}: {names}")
            else:
                print(f"  -> {concept}: 无成份股数据")

        except Exception as e:
            print(f"  -> {concept}: 获取失败 ({e})")
            result[concept] = []

    return result


# ── 报告生成 ──────────────────────────────────────────

def _fmt_pct(val):
    if pd.isna(val):
        return "--"
    return f"+{val:.2f}%" if val >= 0 else f"{val:.2f}%"


def _fmt_time(t):
    if pd.isna(t):
        return "--:--"
    if hasattr(t, "strftime"):
        return t.strftime("%H:%M")
    s = str(t)
    parts = s.split(" ")
    return parts[1][:5] if len(parts) > 1 else s[:5]


def _fmt_datetime(t):
    """格式化时间为 YYYY-MM-DD HH:MM（用于个股新闻、相关财经新闻）"""
    if pd.isna(t):
        return "--:--"
    if hasattr(t, "strftime"):
        return t.strftime("%Y-%m-%d %H:%M")
    s = str(t)
    # 尝试解析常见的日期时间格式
    parts = s.split(" ")
    if len(parts) >= 2:
        date_part = parts[0]
        time_part = parts[1][:5] if len(parts[1]) >= 5 else parts[1]
        return f"{date_part} {time_part}"
    return s[:16]


def generate_report(concepts_df, global_news_df, stock_news_map, concept_news_map, concept_stocks_map, config):
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    weekday_cn = "一二三四五六日"[now.weekday()]
    top_n = config.get("top_n_concepts", 20)
    detail_n = config.get("top_n_detail_concepts", 10)
    news_n = config.get("top_n_global_news", 20)

    L = []
    L.append(f"# A股热点日报 - {today_str}（周{weekday_cn}）\n")
    L.append(f"> 生成时间：{now.strftime('%Y-%m-%d %H:%M:%S')}")
    L.append("> 数据来源：同花顺（概念资金流向）+ 东方财富（财经快讯 / 个股新闻）\n")

    # ── 一、热点概念榜 ──
    L.append("## 一、今日热点概念榜（同花顺）\n")
    L.append("| 排名 | 概念 | 涨跌幅 | 净额(亿) | 流入(亿) | 流出(亿) | 家数 | 领涨股 | 领涨涨幅 |")
    L.append("|------|------|--------|---------|---------|---------|------|--------|---------|")
    for i, (_, r) in enumerate(concepts_df.head(top_n).iterrows(), 1):
        L.append(
            f"| {i} | {r['概念名称']} | {_fmt_pct(r['涨跌幅'])} | "
            f"{r['净额']:+.2f} | {r['流入资金']:.2f} | {r['流出资金']:.2f} | "
            f"{int(r['成份股数量'])} | {r['领涨股']} | {_fmt_pct(r['领涨股涨跌幅'])} |"
        )
    L.append("")

    # ── 二、重点财经新闻 ──
    L.append("## 二、重点财经新闻\n")
    L.append("| 时间 | 标题 | 链接 |")
    L.append("|------|------|------|")
    for _, r in global_news_df.head(news_n).iterrows():
        title = str(r["标题"])[:60]
        url = str(r.get("链接", ""))
        if url and url != "nan":
            title_display = f"[{title}]({url})"
        else:
            title_display = title
        L.append(f"| {_fmt_datetime(r['发布时间'])} | {title_display} | {url if (url and url != 'nan') else '--'} |")
    L.append("")

    # ── 三、热点概念详解 ──
    L.append(f"## 三、热点概念详解（Top {detail_n}）\n")
    for i, (_, r) in enumerate(concepts_df.head(detail_n).iterrows(), 1):
        concept = r["概念名称"]
        L.append(f"### {i}. {concept} {_fmt_pct(r['涨跌幅'])}（净额 {r['净额']:+.2f} 亿）\n")

        # 领涨股 Top 3
        sdata = stock_news_map.get(concept, {})
        stocks = sdata.get("stocks", [])
        if stocks:
            L.append("**领涨股 Top 3：**\n")
            for s in stocks:
                L.append(f"- {s['名称']}（{s['代码']}）{_fmt_pct(s['涨跌幅'])}")
                snews = s.get("news", [])
                for n in snews:
                    L.append(
                        f"  - [{_fmt_datetime(n.get('发布时间', ''))}] "
                        f"[{n.get('新闻标题', '')}]({n.get('新闻链接', '')})"
                        f"（{n.get('文章来源', '')}）"
                    )
            L.append("")
        else:
            lead = r["领涨股"]
            lead_pct = r.get("领涨股涨跌幅")
            if lead and not pd.isna(lead):
                L.append(f"**领涨股：** {lead}（{_fmt_pct(lead_pct)}）\n")

        # 关联财经新闻
        cnews = concept_news_map.get(concept, [])
        if cnews:
            L.append("**相关财经新闻：**\n")
            for n in cnews:
                title = str(n.get("标题", ""))[:50]
                L.append(
                    f"- [{_fmt_datetime(n.get('发布时间', ''))}] "
                    f"[{title}]({n.get('链接', '')})"
                )
            L.append("")

        if not stocks and not cnews:
            L.append("*暂无相关新闻*\n")

        L.append("---\n")

    # ── 三.五、概念领涨股 Top 3 ──
    L.append(f"## 三.五、概念领涨股 Top 3\n")
    L.append("| 排名 | 概念 | 领涨股1 | 涨幅 | 领涨股2 | 涨幅 | 领涨股3 | 涨幅 |")
    L.append("|------|------|---------|------|---------|------|---------|------|")
    for i, (_, r) in enumerate(concepts_df.head(top_n).iterrows(), 1):
        concept = r["概念名称"]
        stocks = concept_stocks_map.get(concept, [])
        if stocks and len(stocks) >= 3:
            s1, s2, s3 = stocks[0], stocks[1], stocks[2]
            L.append(
                f"| {i} | {concept} | "
                f"{s1['名称']}({s1['代码']}) | {_fmt_pct(s1['涨跌幅'])} | "
                f"{s2['名称']}({s2['代码']}) | {_fmt_pct(s2['涨跌幅'])} | "
                f"{s3['名称']}({s3['代码']}) | {_fmt_pct(s3['涨跌幅'])} |"
            )
        elif stocks and len(stocks) >= 1:
            parts = []
            for s in stocks[:3]:
                parts.append(f"{s['名称']}({s['代码']}) | {_fmt_pct(s['涨跌幅'])}")
            while len(parts) < 3:
                parts.append("-- | --")
            L.append(f"| {i} | {concept} | {' | '.join(parts)} |")
        else:
            L.append(f"| {i} | {concept} | -- | -- | -- | -- | -- | -- |")
    L.append("")

    # ── 四、资金流向摘要 ──
    L.append("## 四、概念资金流向摘要\n")

    L.append("**资金净流入 Top 5：**\n")
    L.append("| 概念 | 净额(亿) | 涨跌幅 |")
    L.append("|------|---------|--------|")
    for _, r in concepts_df.nlargest(5, "净额").iterrows():
        L.append(f"| {r['概念名称']} | {r['净额']:+.2f} | {_fmt_pct(r['涨跌幅'])} |")
    L.append("")

    L.append("**资金净流出 Top 5：**\n")
    L.append("| 概念 | 净额(亿) | 涨跌幅 |")
    L.append("|------|---------|--------|")
    for _, r in concepts_df.nsmallest(5, "净额").iterrows():
        L.append(f"| {r['概念名称']} | {r['净额']:+.2f} | {_fmt_pct(r['涨跌幅'])} |")
    L.append("")

    L.append("---")
    L.append(f"\n*本报告由 AkShare 数据自动生成，仅供参考。*\n")
    return "\n".join(L)


# ── Excel 输出 ────────────────────────────────────────

def save_excel(concepts_df, global_news_df, stock_news_map, concept_stocks_map, config):
    today_str = datetime.now().strftime("%Y%m%d")
    path = REPORT_DIR / f"热点数据_{today_str}.xlsx"

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        concepts_df.head(config.get("top_n_concepts", 20)).to_excel(
            writer, sheet_name="热点概念榜", index=False
        )
        global_news_df.head(config.get("top_n_global_news", 20)).to_excel(
            writer, sheet_name="财经新闻", index=False
        )
        rows = []
        for concept, data in stock_news_map.items():
            for s in data.get("stocks", []):
                for n in s.get("news", []):
                    rows.append({
                        "概念": concept,
                        "股票名称": s["名称"],
                        "股票代码": s["代码"],
                        "涨跌幅(%)": s["涨跌幅"],
                        "新闻标题": n.get("新闻标题", ""),
                        "发布时间": n.get("发布时间", ""),
                        "文章来源": n.get("文章来源", ""),
                        "新闻链接": n.get("新闻链接", ""),
                    })
        if rows:
            pd.DataFrame(rows).to_excel(writer, sheet_name="个股新闻", index=False)

        # 概念领涨股 Top 3
        stock_rows = []
        for concept, stocks in concept_stocks_map.items():
            rank = 1
            for s in stocks:
                stock_rows.append({
                    "概念": concept,
                    "排名": rank,
                    "股票代码": s["代码"],
                    "股票名称": s["名称"],
                    "涨跌幅(%)": s["涨跌幅"],
                })
                rank += 1
        if stock_rows:
            pd.DataFrame(stock_rows).to_excel(writer, sheet_name="概念领涨股Top3", index=False)

    return path


# ── 主流程 ────────────────────────────────────────────

def main():
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    config = load_config()

    print(f"=== A股热点日报生成 {datetime.now().strftime('%Y-%m-%d %H:%M')} ===\n")

    if not is_trading_day():
        print("今天非交易日，跳过。")
        return

    # 1. 概念资金流向
    try:
        concepts_df = fetch_concept_fund_flow()
    except Exception as e:
        print(f"FATAL: 获取概念资金流向失败: {e}")
        traceback.print_exc()
        return
    if concepts_df.empty:
        print("概念数据为空，可能是非交易日或接口异常。")
        return

    # 2. 财经新闻
    try:
        global_news_df = fetch_global_news(config)
    except Exception as e:
        print(f"WARNING: 获取财经新闻失败: {e}")
        global_news_df = pd.DataFrame(columns=["标题", "摘要", "发布时间", "链接"])

    # 3. 概念成份股 Top 3（先获取，供个股新闻使用）
    try:
        concept_stocks_map = fetch_concept_leading_stocks(concepts_df, config)
    except Exception as e:
        print(f"WARNING: 获取概念领涨股失败: {e}")
        concept_stocks_map = {}

    # 4. 个股新闻（遍历 Top 20 概念 x 3 只 = 60 只股票）
    try:
        stock_news_map = fetch_stock_news_for_concepts(concept_stocks_map, config)
    except Exception as e:
        print(f"WARNING: 获取个股新闻失败: {e}")
        stock_news_map = {}

    # 5. 关联新闻
    try:
        concept_news_map = match_news_to_concepts(global_news_df, concepts_df, config)
    except Exception as e:
        print(f"WARNING: 关联新闻失败: {e}")
        concept_news_map = {}

    # 生成报告
    print("\n生成报告中...")
    md = generate_report(concepts_df, global_news_df, stock_news_map, concept_news_map, concept_stocks_map, config)
    today_str = datetime.now().strftime("%Y%m%d")
    md_path = REPORT_DIR / f"热点日报_{today_str}.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"\n日报已保存: {md_path}")

    if "excel" in config.get("output_format", []):
        try:
            xlsx_path = save_excel(concepts_df, global_news_df, stock_news_map, concept_stocks_map, config)
            print(f"Excel 已保存: {xlsx_path}")
        except Exception as e:
            print(f"WARNING: 保存 Excel 失败: {e}")

    print("\n=== 完成 ===")


if __name__ == "__main__":
    main()
