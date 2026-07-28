# 热点数据自动同步

自动读取 workbuddy 生成的 Excel 热点数据，转成 JSON 并推送到 GitHub，网页端自动拉取。

## 使用方法

### Windows 双击运行

1. 编辑 `sync.bat`，把 `REPORTS_DIR` 改成你本地 reports 文件夹的完整路径
2. 双击 `sync.bat` 运行

### Windows 计划任务（定时自动同步）

1. 按 Win+R，输入 `taskschd.msc` 打开任务计划程序
2. 创建基本任务 → 名称：`热点数据同步`
3. 触发器：每天（或按 workbuddy 生成时间设置 3 次）
4. 操作：启动程序 → 选择 `sync.bat` 的完整路径
5. 起始于（可选）：填 `sync.bat` 所在文件夹

### 命令行

```bash
# 只解析，不推送（预览）
node scripts/sync-hotspot/sync.js --reportsDir="路径" --dry

# 解析并推送
node scripts/sync-hotspot/sync.js --reportsDir="路径" --push
```

## 数据格式

支持 Excel 文件：`热点数据_YYYYMMDD.xlsx`

三个 sheet：
- **热点概念榜**: 序号/概念名称/概念指数/涨跌幅/流入资金/流出资金/净额/成份股数量/领涨股/领涨股涨跌幅/领涨股价
- **财经新闻**: 概念/领涨股/新闻标题/发布时间/文章来源/新闻链接
- **个股新闻**: 同上结构

## 网页端

大盘热点页面自动 fetch `public/market-hot.json`，每 5 分钟刷新一次。
