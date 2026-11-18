# 发布模型坐标

开发期间将用户可感知的新增、变更和修复归入 [CHANGELOG.md](../CHANGELOG.md) 顶部的 `Unreleased`。公开版本只列本次实际交付的内容，正文中的引用用可在 GitHub Release 上独立使用的链接。

1. 定版时将本次条目移到带 UTC 发布日期的新版本小节，保留顶部的 `Unreleased`。更新底部的版本链接，并让 `Unreleased` 从新标签比较到 `HEAD`。
2. 核对小节版本、`package.json`、安装包版本和 Git 标签一致。验证安装包后，将更新日志与对应源码一起提交和打标签。
3. 从已验收的发布标签导出该版本的条目正文，将导出的文件作为 GitHub Release 说明。使用发布包所在的实际路径。

```powershell
# 在已检出的发布标签源码目录执行
$version = node -p "require('./package.json').version"
$tag = "v$version"
$notes = New-TemporaryFile
try {
    node scripts/release-notes.mjs $version | Set-Content -LiteralPath $notes.FullName -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw '更新日志缺少对应版本的有效条目' }
    gh release create $tag ./dsh-model-coordinates.tgz --verify-tag --title "模型坐标 $version" --notes-file $notes.FullName
    if ($LASTEXITCODE -ne 0) { throw 'GitHub Release 发布失败' }
} finally {
    Remove-Item -LiteralPath $notes.FullName
}
```

发布后核对页面正文与该版本的更新日志一致，再验证安装包下载。
