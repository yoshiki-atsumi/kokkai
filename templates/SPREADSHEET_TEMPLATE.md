# Spreadsheet Template

`scripts/fetch-sheet.mjs` が読む列名テンプレートです。  
衆議院用シート・参議院用シートの両方で同じ列を使ってください。

## GitHub Secrets 名

- `SHEET_SYU_URL`: 衆議院シートの公開URL
- `SHEET_SAN_URL`: 参議院シートの公開URL

## 必須列

- `name`: 会派名
- `seats`: 議席数（数値）

## 任意列（指定すると優先）

- `bloc`: `government` または `opposition`
- `color`: 色コード（例 `#c73a3f`）
- `order`: 表示順（小さい数字が左）
- `shortLabel`: グラフに出す略称

## そのまま使えるヘッダー行

```csv
name,seats,bloc,color,order,shortLabel
```

## サンプル

```csv
自由民主党,247,government,#c73a3f,1,自民
公明党,32,government,#f08c2e,2,公明
立憲民主党,98,opposition,#e0559b,10,立憲
日本維新の会,41,opposition,#6cb24f,11,維新
```

## メモ

- `bloc` を空にすると、`自由民主党` と `公明党` は自動で `government`、それ以外は `opposition` 扱いになります。
- `order` を空にした行は後ろに回り、次に与党/野党、最後に議席数で並びます。
