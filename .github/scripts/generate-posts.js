const fs = require('fs');
const path = require('path');

const postsDir = path.join(process.cwd(), 'blog', 'posts');
const outputFile = path.join(process.cwd(), 'data', 'posts.json');

// 确保 data 目录存在
if (!fs.existsSync(path.dirname(outputFile))) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
}

function extractDateFromFilename(filename) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})-/);
  return match ? match[1] : null;
}

function extractTitleFromHtml(content, filenameFallback) {
  const titleMatch = content.match(/<title>(.*?)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  // 如果没有 title，从文件名去掉日期和扩展名
  return filenameFallback.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.html$/, '');
}

function extractExcerptFromHtml(content) {
  // 尝试找到第一个 <p> 内容作为摘要
  const pMatch = content.match(/<p>(.*?)<\/p>/i);
  if (pMatch) {
    let text = pMatch[1].replace(/<[^>]*>/g, '').trim();
    if (text.length > 150) text = text.slice(0, 150) + '…';
    return text;
  }
  return '暂无摘要，点击阅读全文。';
}

function generatePostsJson() {
  const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.html') && f !== 'template.html');
  const posts = [];

  for (const file of files) {
    const filePath = path.join(postsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const date = extractDateFromFilename(file);
    if (!date) {
      console.warn(`Skipping ${file}: filename does not start with YYYY-MM-DD-`);
      continue;
    }
    const title = extractTitleFromHtml(content, file);
    const excerpt = extractExcerptFromHtml(content);
    const url = `blog/posts/${file}`;

    posts.push({
      id: file.replace(/\.html$/, ''),
      title,
      date,
      excerpt,
      url
    });
  }

  // 按日期倒序排列（最新的在前）
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  const output = { posts };
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`Generated ${posts.length} posts -> ${outputFile}`);
}

generatePostsJson();
