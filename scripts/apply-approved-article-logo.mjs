// Copy the exact approved logo embedded in the homepage into generated article pages.
// Preview only: never edits index.html or deploys.
import {readFile,readdir,writeFile} from 'node:fs/promises';
const home=await readFile('index.html','utf8');
const match=home.match(/<img\s+alt="شعار القانون AQ"\s+src="(data:image\/png;base64,[A-Za-z0-9+/=]+)"/);
if(!match)throw Error('Approved homepage logo not found; refusing to substitute a different logo');
const logo=match[1];
const files=(await readdir('seo-preview-output/articles')).filter(n=>/^[1-9][0-9]*\.html$/.test(n));
if(!files.length)throw Error('No generated article pages to update');
for(const file of files){
 const path='seo-preview-output/articles/'+file;
 let html=await readFile(path,'utf8');
 const old=/<img class="brand-logo" src="\/logo\.png" alt="منصة القانون AL-QANON">/;
 if(!old.test(html))throw Error('Expected article logo reference not found: '+file);
 html=html.replace(old,'<img class="brand-logo" src="'+logo+'" alt="شعار القانون AQ">');
 await writeFile(path,html);
}
console.log('Copied exact approved homepage logo into '+files.length+' article pages (preview only).');
