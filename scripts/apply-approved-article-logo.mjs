// Reuse the exact approved logo already embedded in the published homepage.
// No image recreation, color substitution or alteration of index.html.
import {readFile,readdir,writeFile} from 'node:fs/promises';
const home=await readFile('index.html','utf8');
const match=home.match(/<img\s+alt="شعار القانون AQ"\s+src="(data:image\/png;base64,[A-Za-z0-9+/=]+)"/);
if(!match)throw Error('Approved homepage logo not found; refusing to substitute a different logo');
const logo=match[1];
const files=(await readdir('seo-preview-output/articles')).filter(n=>/^[1-9][0-9]*\.html$/.test(n));
for(const file of files){
 const path='seo-preview-output/articles/'+file;
 let html=await readFile(path,'utf8');
 const old=/<span class="brandmark">A<span>Q<\/span><\/span><span class="brandname">[\s\S]*?<\/span>/;
 if(!old.test(html))throw Error('Article brand placeholder not found: '+file);
 html=html.replace(old,'<img class="approved-logo" alt="شعار القانون AQ" src="'+logo+'">');
 html=html.replace('</style>','.approved-logo{display:block;width:clamp(160px,24vw,235px);height:auto;max-height:68px;object-fit:contain}</style>');
 await writeFile(path,html);
}
console.log('Applied unchanged approved homepage logo to '+files.length+' article pages.');
