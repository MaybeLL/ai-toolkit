import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const sections = changelog.split(/^## /m).slice(1);
const section = sections.find(text => text.split('\n')[0].trim() === version);
if (!section) throw new Error(`Missing changelog for ${version}`);
console.log(section.slice(section.indexOf('\n')).trim());
console.log('\n每个 ZIP 可独立解压安装；SHA256SUMS 校验文件，release.json 记录来源提交。组合 Skill 的依赖见 README。');
