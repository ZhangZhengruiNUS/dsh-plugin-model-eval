/** Development-only input audits. Not shipped, and never a model-answer repair. */
import {identityHash} from '../../src/evaluation/protocol-identity.ts';
export const ADAPTATION_VERSION='code-contests-input-audit-v4';
export const REVIEWED_SOURCE_HASHES:Record<string,string>=/* SOURCE_PINS_START */{
  "0": "13469a4829f0824b86febb722718e2c3c17f30ce1f6456996a936222caa9421a",
  "2": "9fe2b685156440d62d7b8e89169adcc8e55a27597c2787119d6b68d8ca0b6a58",
  "3": "3d7648c9cd95f6f6ccfc2713882a4dc478850955faa7d5d019c97b79b802b376",
  "4": "9016f416ad26605c0ee47ad64ac47622e702325f339d8ae7372c307d6a3bed77",
  "5": "27f21ebe20c07bdd0f65e90f3b71d88a2dc3fce0351fe5faf01c3eb1ae56ac17",
  "6": "2fff38930e30ebdc51103311dfc5ac9b5513f25881ab9dd57268f37331ad996b",
  "7": "5e864c1f4bcc44b7082ed2773b36919030ece8eac5370bbc4cabab82b947a664",
  "8": "ed406a029ff7dbbb517d44afcddafbc0b296ef569d567aa5b18c8b9161f6630e",
  "9": "ae6e6e48498057c6297d329fde2b4e9d414427528946a5d23bfc2f387c085631",
  "11": "a819e9afaaa5cd5aba350e28a88271626489f257ced81512672dbe64ae6631cc",
  "12": "53779ffd6bb09c5506f721e0de7e50495af3982adf489ad6fb05ef23060c95b6",
  "17": "471958c80f4553e8018b58314f9a098339b7368fe9986e06b8da654ae58c7e6f",
  "18": "0b9b5a54853408599d21a3e708d012e14c9f952dae125b4d5af0a24531d5a9c0",
  "19": "ae4cae398ce86b8a775f2f6ff402121ac2f8ff57403756045388b687f89b61ed",
  "20": "f4ef43f958529f3ca28e7915ad340c08c3eb5018416d389b16125c7636efa58f",
  "21": "eec0101640e010a0ffabc609fa2e5d2d3031a3eab007f06ed98da34b59883e27",
  "22": "9354fc7c7851091be9c8aa89d3d8e1492c73232d5f5993410bcb73547329c7b5",
  "23": "e0ca12f21c2cc4ecc8461de5a0454f1e80bc9b53d03c2a5761ecac32e4db2487",
  "24": "8b095362fb68cf3e7624b20e52d2872bca37a064755183d5c07649a200bb83da",
  "25": "0aa6e3224a8743b4e7493812d1e3ab0eefbc6c311f8c3b80eaff4fdf86b6ac69",
  "26": "994df5919fc3ace4726360e1dca2308c5c6be6edcd74609e182cc4a4b5f8a376",
  "28": "444aa6cff55b716accefe38729a3c64cb9c467834017a79aa1313edf41a98775",
  "29": "73f5f82ac1d225c61afe41bb75a2069bf148d51b4069ff5d794a39dde36b144c",
  "30": "ccb682c41933f5949ff193723f2b409915f773ab1ef2fca597b01cb192e6dabd",
  "32": "84e067cb6d8a1a786209f76c6f98ea2519b9ae18b3550d9819fc7e8ece11dd65",
  "33": "7c6ffddb5cf95112d831dd4e355bd7e9f2cb4b3f8e1ec4546b3af88435aaebb7",
  "34": "78e192d8c072f9879e03ba9811fa9473ea4506b66786cb2f9d15489e6bb9dc0f",
  "35": "30b34bb36ee771b22faf66dfc36fccb9bd46797b258655568e802f27aad9b714",
  "42": "ace7fce75fc556c4736bb13dc220ba5b345c1c47b10cf55e1dddc6ac3100c00e",
  "43": "bab25cd0b977d31ba7d3ac1d30147de2c19b0ece35a348728dbb51f05a07bd91",
  "44": "cd01b96baf81faafe6cc9277979ef781a631449f9641331ea470c8d843b8e2fd",
  "45": "e0ffc278f4b5ee1afc8c955627ce86b5f7207615ee1eb43da08e3cd34100a61b",
  "47": "cf2aea19aa715362ab2d4f2b66e18f7af930d3e652041e2e080a536276f4f3ea",
  "50": "522ca3c7f1b06b55926e2580ab852b1d703dd99937d0dc6b703b58b7eb6798a7",
  "54": "3f7e3ea890d11efe4e44add71d62c88dffa27014eff6cac99449e14776c82815",
  "55": "cdd4865b843410c1213677cb74efd1414bb6aaa92f2e2208b8a1110d724013e8",
  "56": "1a99f61d6ebb687ca92031572075701193230dcdeb1bad760b23f468cb5bea8b",
  "59": "22bab3f12cfb3445a3a96635f2864e333b1ec7fb6e498ef43f08b5cf4e337666",
  "60": "9e92ab1ec7130895fbf2c6fa7cf7d6cbcd737922e1f79343935047ea8bac361c",
  "61": "34e7a08928ea77206e35f0350956b652d076abee6717d25b49faa06a42791228",
  "62": "1c68ef4a775017ec8838bd792d2196aa5755d7c91291add45b9a512dc275f5cf",
  "63": "b9e77b25142f989b7b0c50b199541181607a964e261e342e6f441d80e454640c",
  "66": "3fc1472be3e6cd97845105e32702900fa0e5a8fa7167ee7b602a6b2bb5e0b583",
  "68": "8aa9c63be9282936a201cc59087eb16ec6ae94baa2d5600093962e0c493a3f80",
  "69": "3991f68f0f655cc0722be057945657d782b2a77707764362bac4bf68674c14a9",
  "70": "f796f457460ce87b021cfd5ac9e2d94e223fe61b34a019beadf5f8cc1584105b",
  "73": "555469512488b44b3e12fef2ff108aa94baacc322b47a1bda8aeb1c0091cf516",
  "75": "1ae24ad550daa0d62741b71d1ee24227a04ec0d3ca56dded90355285c746f5f2",
  "77": "088d479830e12cb994d0f1aa2ff5180c1c8dd2a25f807edc83bf9f04c15aa023",
  "78": "633299762fa5435826b1f1e1a7565cdcf14f8e49c0e8e5d531371e6864d75f2c",
  "80": "e3b9e98662bd6a908d5b63b6104561c5b16146505b87bde908fa2c82b2e309a3",
  "81": "e5697a19dbc9f2cded5d8426d3e86f284f4812a0250d4d31f5f7a9fd39d903e5",
  "82": "99a9a3017eadf88edfc242a22bfb6c785f13b89c2a8ed1f045533f1f22c97732",
  "83": "4581bcd4df13fe20ce6e8cbf792971ad4697121db99e2f495a9330cc4a1addb9",
  "84": "21d7b6a9d3188a668b73b07be83ef5faeae88448578c9690acecd1c82d111930",
  "85": "bb90f074b805e6344526faa47162bae5da7a30d6043eee133c60f49297a2487b",
  "86": "36f39dce920dd949dda9f4633a1c9af3813ae66efc8e01fce8c64e18d368ffa8",
  "87": "86abbadc9dc826cacf3597da3ca10470a2a3e7375f0e73d9d29e3e5687b82602",
  "91": "a555cf838fd7d50b2cd85a2ad7fc26ae457c78fa016069b73a040a78df480539",
  "93": "c7ca5f5d93ef22bfc556809dc6abfefda2a57dbbedbf9f62b7dc37c699065979",
  "94": "fcf626818ba6d4fa3c43b83c329febae20eb2c1f6e9528fa1e318fdc18ca00b0",
  "96": "860eb3cc9ca9d54770cd9e780f9e57d547cbb6d3155b7dafbcbc556e14529387",
  "97": "68230fed727e778db68859893b84127f0c22148b363acf0f47711a6ae7205f2e",
  "99": "7c73c4a91a8f857d4fd573b548bf1e4548d97d646c3639d4316121598d07d5c8",
  "100": "af2f400855838d9751d71ec384ef0272102a455400ee3c1ad17eeb8b42632004",
  "108": "ce2ca849452948286cd021508197e1aefb5e283c2f112b2476556fc21c8a0b5f",
  "109": "c9c69e87b853df5efc0d1fcfee14c33d9d910e92728c01575085e20cf4737645",
  "110": "c80ca62231339748aab164463da6c1f9ad9c563f5ba3ba3c31339fc78ac389d7",
  "111": "7b351ed19bc6f24246e7affeebf0bf5cdde6395413fb0c19be356d99027de1f4",
  "112": "7a7c9836eecefaf370320f7c9bfa2d28270c8abf8c6f92e1315e38c20b3a9994",
  "113": "af73c18f293087cc2cbbb7e59d20868a5a88462905965c434c2c29c2e337b2ea",
  "115": "e44dd4912017f199e8b8562f56dc8a8595ee41992f9239440dd31feb0b61ed35",
  "116": "f346c76dc0d7c2cbf0014f59fc2db1032d6246d189afbf53c4fbffd763dee83a",
  "118": "f96191e6c802e16fcde9820f06bb33d43e59d576c5877e9f0cae0c0b1baa4709",
  "119": "4513e7b3c610103b9c760bffd04a4c92173f1e19d3184cf0798e2699bbdb2ca5",
  "120": "96c11d5b243192ecbe5be8b4c273af9c2c26ac21da5ccc58bae3a37a2a52513f",
  "121": "9e21a3b5ef977644f2f9a5b874f55fcf5654952c8b7bcfde284840c6047de555",
  "123": "321168bf7f4938b8fb529dd9d32c8f1a6a7c33c9231815b96a3b357447e4ec35",
  "124": "8ba65e97be9ad7d925644a3e7ec9ce0bf56e0e949e1ab23cf1202fc45c0b0d50",
  "127": "2cd747643e9a914d60eb2ec58b082c8c77eee6bf81882e4e2843745860f0721c",
  "129": "5a1e8331230deecec8e5137cd7f26d588b15e4a06bc7c8177f66741cc4fa228b",
  "135": "20703a9b8bfed0f60c8fc54e99648f789c7a50009af3405b6a0aaa6206aae2b1",
  "138": "c51b494f45e910bf294a338dc85932df70bf645596c71ff1880533c75048eb6a",
  "140": "211f933cda331ca0c3c9b8d762e564a14d551e1d4a1fffc286460f972e4261bd",
  "142": "950991b2dbc1e82a515254daf2e610ee29aea8333ad9e0ebfaba157ac225b57a",
  "143": "a0cea27d02a81750ad9af32e51f890ae62cad1b7f7467007f79a7ed817e13fb5",
  "145": "917f728356d3ac2d0891c12e9aac043fb46451cd99f0c84965d7c89d99cb8dc6",
  "146": "ca01afdc838f6396ee5820863210869832ba601f4ab319726267261ea1a2f8d8",
  "147": "2ab5856fb443929a126b4d29c14fe8c80e4f6d66fdba8ef17657defadc9bbccd",
  "148": "410957116883afc9e97ec4ef64e168f4d2a25475aee5e761d41552a0c186e0e5",
  "149": "aaf61c1dc91d3324a4a422dbab73d8822955c5ab7dcb73e7b89ce6a4abd88127",
  "150": "2497bd70cc738340043afc59967e5026afff8a7dc479712e9d3c88781412e477",
  "151": "e92710fe334df1674a096fa8f00a2115dd2513278dccb2cf14f6fcb43ecc5703",
  "153": "b2ca665e1a8a0358e37c1e6340046ba56d5378513b66a68a2bafe1fce31f408f",
  "156": "4273a723e35811f97e4f12b35dac3625388da1675357a7a33910a4029aabf2f4",
  "157": "d095e6f84da51260f964b8e849b8439cb39605f6493376c02ecd9934592ec10d",
  "160": "8896619fe5db6bd7aa958eec6e107d94cfc1188349a047f1f229a25f9dfaf58a",
  "162": "685f054d19b49bd060bca5c1e4cbb0f632947a25620e5889108a8fd75a75b7e1",
  "163": "05b09243b18bfaa8fdd23666d459a5741d609453a4d551967f87759235cf18b3",
  "164": "4dfbe6cef215a47336411309a043ba673a707a4d23993e8277c5755746d3c3bc"
}/* SOURCE_PINS_END */;
export interface TestCase {stdin:string;expected:string}
interface SourceTests {input:string[];output:string[]}
export interface ContestSource {sourceId:string;sourceRecordHash:string;cases:TestCase[];raw:{public_tests:SourceTests;private_tests:SourceTests;generated_tests:SourceTests}}
type Check={status:'valid'|'pending'}|{status:'invalid';reason:string};
const valid:Check={status:'valid'};
class Input {
  tokens:string[]=[];position=0;lineIndex=0;lineEnds:number[]=[];
  constructor(text:string){for(const line of text.trim().split(/\r?\n/)){for(const token of line.trim().split(/\s+/u).filter(Boolean))this.tokens.push(token);this.lineEnds.push(this.tokens.length);}}
  next(){const token=this.tokens[this.position++];if(token===undefined)throw Error('missing declared token');return token;}
  int(lo:number,hi:number){const s=this.next();if(!/^-?\d+$/.test(s))throw Error('non-integer token');const n=Number(s);if(!Number.isSafeInteger(n)||n<lo||n>hi)throw Error(`integer outside [${lo},${hi}]`);return n;}
  big(lo:bigint,hi:bigint){const s=this.next();if(!/^-?\d+$/.test(s))throw Error('non-integer token');const n=BigInt(s);if(n<lo||n>hi)throw Error(`integer outside [${lo},${hi}]`);return n;}
  scalar(lo:number,hi:number){const n=this.int(lo,hi);this.boundary();return n;}
  array(n:number,lo:number,hi:number){const values=Array.from({length:n},()=>this.int(lo,hi));this.boundary();return values;}
  word(pattern:RegExp,min:number,max:number){const s=this.next();this.boundary();if(s.length<min||s.length>max||!pattern.test(s))throw Error('string length or alphabet violates statement');return s;}
  characters(length:number,pattern:RegExp){const end=this.lineEnds[this.lineIndex];if(end===undefined||end<this.position)throw Error('missing character row');const s=this.tokens.slice(this.position,end).join('');this.position=end;this.boundary();if(s.length!==length||!pattern.test(s))throw Error('character row length or alphabet violates statement');return s;}
  blanks(){let n=0;while(this.lineIndex<this.lineEnds.length&&this.lineEnds[this.lineIndex]===this.position){this.lineIndex++;n++;}return n;}
  boundary(){if(this.lineEnds[this.lineIndex++]!==this.position)throw Error('declared line length mismatch');}
  end(){if(this.position!==this.tokens.length||this.lineIndex!==this.lineEnds.length)throw Error('extra tokens beyond declared input');}
}
const increasing=(values:number[])=>{if(values.some((v,i)=>i>0&&v<=values[i-1]!))throw Error('values must be strictly increasing');};
const unique=(values:readonly unknown[])=>{if(new Set(values).size!==values.length)throw Error('declared uniqueness violated');};
const prime=(n:number)=>{if(n<2)return false;if(n%2===0)return n===2;for(let d=3;d*d<=n;d+=2)if(n%d===0)return false;return true;};
class PendingContract extends Error {}
class DSU {
  parent:number[];components:number;
  constructor(n:number){this.parent=Array.from({length:n+1},(_,i)=>i);this.components=n;}
  find(x:number):number{while(this.parent[x]!==x){this.parent[x]=this.parent[this.parent[x]!]!;x=this.parent[x]!;}return x;}
  join(a:number,b:number){a=this.find(a);b=this.find(b);if(a===b)return false;this.parent[a]=b;this.components--;return true;}
}
function treeEdges(input:Input,n:number,extras?:()=>void){const d=new DSU(n);for(let i=1;i<n;i++){const u=input.int(1,n),v=input.int(1,n);if(!d.join(u,v))throw Error('edges do not form a tree');extras?.();input.boundary();}}
/** Minimum commutes with any monotone clamp/add; lazy tags are composed functions. */
class RangeMinimum {
  size:number;minimum:Float64Array;add:Float64Array;lo:Float64Array;hi:Float64Array;
  constructor(values:number[]){this.size=values.length;const n=values.length*4+8;this.minimum=new Float64Array(n);this.add=new Float64Array(n);this.lo=new Float64Array(n).fill(-Infinity);this.hi=new Float64Array(n).fill(Infinity);
    const build=(p:number,l:number,r:number)=>{if(l===r){this.minimum[p]=values[l]!;return;}const m=(l+r)>>1;build(p*2,l,m);build(p*2+1,m+1,r);this.minimum[p]=Math.min(this.minimum[p*2]!,this.minimum[p*2+1]!);};build(1,0,values.length-1);}
  apply(p:number,add:number,lo:number,hi:number){const clamp=(x:number)=>Math.min(hi,Math.max(lo,x));this.minimum[p]=clamp(this.minimum[p]!+add);this.add[p]=this.add[p]!+add;this.lo[p]=clamp(this.lo[p]!+add);this.hi[p]=clamp(this.hi[p]!+add);}
  update(left:number,right:number,kind:number,x:number){const visit=(p:number,l:number,r:number)=>{
    if(left<=l&&r<=right){this.apply(p,kind===3?x:0,kind===2?x:-Infinity,kind===1?x:Infinity);return;}
    for(const child of [p*2,p*2+1])this.apply(child,this.add[p]!,this.lo[p]!,this.hi[p]!);
    this.add[p]=0;this.lo[p]=-Infinity;this.hi[p]=Infinity;
    const m=(l+r)>>1;if(left<=m)visit(p*2,l,m);if(right>m)visit(p*2+1,m+1,r);this.minimum[p]=Math.min(this.minimum[p*2]!,this.minimum[p*2+1]!);
  };visit(1,0,this.size-1);if(this.minimum[1]!<0)throw Error('array becomes negative after query');}
}
type Point=readonly [bigint,bigint];
const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
/** Exact small-instance audit of the stated unique-hit guarantee; expensive inputs stay pending. */
function bubbleGuarantees(points:Point[],queries:[number,number,number][]){let work=0;
 for(const [dx,dy,k] of queries){
  if(dx===0&&dy===0)throw new PendingContract('zero direction is not specified as a valid stick orientation');
  if((work+=points.length*k)>2000000)throw new PendingContract('geometric guarantee audit exceeds development work bound');
  let direction:Point=[BigInt(dx),BigInt(dy)],current=-1,min:bigint|undefined,ties=0;
  points.forEach((p,i)=>{const v=cross(direction,p);if(min===undefined||v<min){min=v;current=i;ties=1;}else if(v===min)ties++;});
  if(ties!==1)throw Error('initial support line hits multiple bubbles');
  const remaining=new Set(points.map((_,i)=>i));remaining.delete(current);
  for(let step=1;step<k;step++){
   let best=-1,vector:Point|undefined;ties=0;const center=points[current]!;
   for(const i of remaining){let v:Point=[points[i]![0]-center[0],points[i]![1]-center[1]];const c=cross(direction,v),dot=direction[0]*v[0]+direction[1]*v[1];if(c<0n||(c===0n&&dot<0n))v=[-v[0],-v[1]];
    if(vector===undefined||cross(vector,v)<0n){best=i;vector=v;ties=1;}else if(cross(vector,v)===0n)ties++;
   }
   if(ties!==1||vector===undefined)throw Error('rotating support line hits multiple bubbles');
   current=best;direction=vector;remaining.delete(current);
  }
 }
}
function additional(input:Input,id:string):boolean{
  const arrays:Record<string,[number,number,number,number,number,number]>={
    '87':[200,1,100,1,1e9,Infinity],'60':[10000,3,200000,0,1e9,200000],
    '129':[10000,1,100000,1,1e9,200000],'78':[10000,1,200000,0,2**30-1,200000],
    '162':[200000,3,200000,1,1e9,200000],'45':[100,1,100,0,1,Infinity],
    '119':[1000,2,100,1,1e7,Infinity],'100':[10000,1,200000,-1e9,1e9,200000],
    '29':[1000,1,60,0,1e9,Infinity],'17':[1000,1,200000,-1e9,1e9,200000],
    '32':[100,1,100000,1,1e9,100000],'150':[1000,1,100,1,1e9,Infinity]
  };
  const a=arrays[id];if(a){const [maxT,minN,maxN,minA,maxA,maxSum]=a,t=input.scalar(1,maxT);let sum=0;for(let i=0;i<t;i++){const n=input.scalar(minN,maxN);sum+=n;if(sum>maxSum)throw Error('sum of n exceeds statement');input.array(n,minA,maxA);}return true;}
  switch(id){
    case '3':input.word(/^[0-9_X]+$/,1,8);break;
    case '55':input.scalar(1,60);break;
    case '33':{const n=input.scalar(1,100000);input.array(n,0,500);break;}
    case '93':{const t=input.scalar(1,100000);for(let i=0;i<t;i++){const n=input.big(1n,10n**18n);input.big(1n,n);input.boundary();}break;}
    case '113':{const t=input.scalar(1,10000);for(let i=0;i<t;i++)for(let j=0;j<2;j++){input.int(1,1e6);input.int(0,1e6);input.boundary();}break;}
    case '115':{const t=input.scalar(1,1000);for(let i=0;i<t;i++){const n=input.int(1,100);input.big(1n,10n**18n);input.boundary();increasing(input.array(n,1,1e9));}break;}
    case '147':{const t=input.scalar(1,1000);for(let i=0;i<t;i++)input.word(/^[EN]+$/,2,50);break;}
    case '94':{const t=input.scalar(1,10000);for(let i=0;i<t;i++){const n=input.int(1,10);input.int(1,1e9);input.boundary();const v=input.array(n,0,9);if(v[0]!==0)throw Error('first exponent must be zero');increasing(v);}break;}
    case '59':{const t=input.scalar(1,10000);let sum=0;for(let i=0;i<t;i++){const n=input.scalar(2,1000);sum+=n;if(sum>100000)throw Error('sum of students exceeds statement');for(let j=0;j<n;j++)if(!input.array(5,0,1).includes(1))throw Error('student has no convenient day');}break;}
    case '28':{const t=input.scalar(1,1000);for(let i=0;i<t;i++)input.array(3,1,1e9);break;}
    case '127':{const t=input.scalar(1,1000);for(let i=0;i<t;i++){input.word(/^[a-z]+$/,1,100);const s=input.word(/^[abc]+$/,3,3);if(new Set(s).size!==3)throw Error('T is not a permutation of abc');}break;}
    case '120':{const t=input.scalar(1,10000);for(let i=0;i<t;i++){const l=input.int(1,200000);input.int(l,200000);input.boundary();}break;}
    case '160':{const t=input.scalar(1,10000);for(let i=0;i<t;i++){const n=input.int(1,100),m=input.int(1,100);input.int(1,n);input.int(1,m);input.int(1,n);input.int(1,m);input.boundary();}break;}
    case '30':case '121':{const binary=id==='121',t=input.scalar(1,binary?10000:100);let sum=0;for(let i=0;i<t;i++){const n=input.scalar(1,100000);sum+=n;if(sum>(binary?100000:200000))throw Error('sum of n exceeds statement');input.word(binary?/^[01]+$/:/^[a-z]+$/,n,n);if(binary)input.word(/^[01]+$/,n,n);}break;}
    case '61':{const t=input.scalar(1,50000);let sum=0;for(let i=0;i<t;i++){const n=input.scalar(3,200000);sum+=n;if(sum>200000)throw Error('sum of n exceeds statement');const seen=new Set<string>();for(let j=0;j<n;j++){const pair=input.array(2,1,n).join(',');if(seen.has(pair))throw Error('duplicate topic/difficulty pair');seen.add(pair);}}break;}
    case '26':{const t=input.scalar(1,100000);let sum=0;for(let i=0;i<t;i++)sum+=input.scalar(1,100000);if(sum>100000)throw Error('sum of n exceeds statement');break;}
    case '156':{const t=input.scalar(1,10000);let sum=0;for(let i=0;i<t;i++){const n=input.int(1,200000);input.int(1,1e15);input.boundary();sum+=n;if(sum>200000)throw Error('sum of n exceeds statement');input.array(n,1,1e9);}break;}
    case '99':{const t=input.scalar(1,10000);for(let i=0;i<t;i++){input.int(-1e14,1e14);input.int(0,1e14);input.boundary();}break;}
    case '140':{const t=input.scalar(1,20);for(let i=0;i<t;i++)input.scalar(1,1e9);break;}
    case '148':{const t=input.scalar(1,10000);let sum=0;for(let i=0;i<t;i++){const w=input.int(3,1e6),h=input.int(3,1e6);input.boundary();for(let j=0;j<4;j++){const k=input.int(2,200000);sum+=k;if(sum>200000)throw Error('sum of side points exceeds statement');const v=Array.from({length:k},()=>input.int(1,(j<2?w:h)-1));input.boundary();increasing(v);}}break;}
    case '6':case '11':case '34':case '50':case '75':{const spec:Record<string,[number,number,number,number]>={'6':[2,100000,1,100000],'11':[1,200000,1,200000],'34':[1,1000000,0,5000],'50':[1,200000,1,1e9],'75':[1,200000,0,1e9]};const [lo,hi,a,b]=spec[id]!;input.array(input.scalar(lo,hi),a,b);break;}
    case '83':input.scalar(1,1e12);break;
    case '25':input.int(2,50000);input.int(1,1e9);input.boundary();break;
    case '96':input.int(2,500);input.int(1,500);input.boundary();break;
    case '85':input.int(1,200);if(!prime(input.int(1e8,1e9)))throw Error('modulus is not prime');input.boundary();break;
    case '21':{const n=input.int(1,100);input.int(1,n);input.int(1,n);input.int(1,1e9);input.boundary();break;}
    case '2':{const n=input.int(1,200000);input.int(1,200000);const k=input.int(1,200000);if(k!==1&&!prime(k))throw Error('k must be one or prime');input.boundary();input.array(n,0,200000);break;}
    case '111':{const n=input.int(1,2000),k=input.int(0,50);input.boundary();input.array(n,-k,n+k);break;}
    case '23':{const n=input.int(1,4000);input.int(1,n);input.boundary();unique(input.array(n,1,2**31-1));break;}
    case '5':{const n=input.int(2,100000),k=input.int(2,1e9);input.boundary();input.array(n,-1,k-1);break;}
    case '7':{const n=input.int(1,500),m=input.int(1,n);input.boundary();input.word(/^[01]+$/,n,n);input.word(/^[01]+$/,m,m);break;}
    case '35':{const n=input.scalar(2,1e6);input.array(n,1,1e6);input.word(/^[/*]+$/,n,n);break;}
    case '109':{const n=input.scalar(1,100000);for(let i=0;i<n;i++)input.characters(2,/^[BW?]+$/);break;}
    case '44':{const n=input.scalar(1,2000);for(let i=0;i<n;i++)input.word(/^[SG.]+$/,n,n);break;}
    case '63':{const n=input.scalar(1,20);let sum=0;for(let i=0;i<n;i++)sum+=input.word(/^[()]+$/,1,400000).length;if(sum>400000)throw Error('sum of bracket lengths exceeds statement');break;}
    case '153':{const n=input.scalar(1,23);for(let i=0;i<n;i++){const s=input.word(/^[a-z]+$/,1,20000);if([...s].some((c,j)=>j>0&&c<s[j-1]!))throw Error('string must be sorted character-wise');}break;}
    case '157':{const n=input.int(2,5000);input.int(0,n);input.boundary();input.word(/^[01]+$/,n,n);break;}
    case '82':{const n=input.int(1,300000),q=input.int(1,300000);input.int(1,n);input.boundary();input.array(n,1,1e9);for(let i=0;i<q;i++){const l=input.int(1,n);input.int(l,n);input.boundary();}break;}
    case '138':{const n=input.int(1,200000),m=input.int(1,200000),q=input.int(1,200000);input.boundary();input.array(n,1,1e9);input.array(m,1,1e9);input.array(q,0,1e9);break;}
    case '81':{const n=input.int(1,500000);input.int(0,1e9);input.boundary();for(let i=0;i<n;i++)input.array(2,0,1e9);break;}
    case '62':{const n=input.int(1,1000),m=input.int(1,1000),q=input.int(1,10000);input.boundary();for(let i=0;i<q;i++){input.int(1,n);input.int(1,m);input.boundary();}break;}
    case '123':{const n=input.int(2,200000);input.int(1,n);input.boundary();treeEdges(input,n);break;}
    case '118':treeEdges(input,input.scalar(2,250000));break;
    case '97':{const n=input.scalar(1,200000);treeEdges(input,n);const q=input.scalar(1,200000);for(let i=0;i<q;i++){input.int(1,n);input.int(0,200000);input.boundary();}break;}
    case '4':{const n=input.int(2,200000);input.int(0,n-1);input.boundary();input.array(n,0,1e9);treeEdges(input,n,()=>{input.int(0,1);});break;}
    case '43':{const n=input.int(2,200000),q=input.int(1,200000);input.boundary();input.array(n,1,1e9);treeEdges(input,n,()=>{input.int(1,1e9);input.int(1,1e9);});for(let i=0;i<q;i++){input.int(1,1e9);input.int(1,n);input.boundary();}break;}
    case '73':{const n=input.int(2,250000),m=input.int(1,500000);input.boundary();for(let i=0;i<m;i++){const u=input.int(1,n),v=input.int(1,n);input.boundary();if(u===v)throw Error('self-loop prohibited');}break;}
    case '24':{const n=input.int(1,200000),m=input.int(1,300000),q=input.int(0,200000);input.boundary();input.array(n,1,1e9);const d=new DSU(n),seen=new Set<string>();for(let i=0;i<m;i++){const u=input.int(1,n),v=input.int(1,n);input.int(1,1e9);input.boundary();if(u===v)throw Error('self-loop prohibited');const key=Math.min(u,v)+','+Math.max(u,v);if(seen.has(key))throw Error('parallel edges prohibited');seen.add(key);d.join(u,v);}if(d.components!==1)throw Error('graph must be connected');for(let i=0;i<q;i++){input.int(1,n);input.int(1,4e8);input.boundary();}break;}
    case '146':{const n=input.int(1,100000),q=input.int(1,100000);input.boundary();unique(input.array(n,1,n));let hasSecond=false;for(let i=0;i<q;i++){const kind=input.int(1,2),x=input.int(1,n),y=input.int(1,n);input.boundary();if(kind===1&&x===y)throw Error('swap indices must differ');hasSecond||=kind===2;}if(!hasSecond)throw Error('second-type query required');break;}
    case '151':{const q=input.scalar(1,500000);let hasFirst=false;for(let i=0;i<q;i++){const kind=input.int(1,2);input.int(1,500000);if(kind===2)input.int(1,500000);input.boundary();hasFirst||=kind===1;}if(!hasFirst)throw Error('first-type query required');break;}
    case '22':{const n=input.int(1,200000),m=input.int(1,200000);input.boundary();for(let i=0;i<n;i++)input.array(2,1,1e9);const active=new Set<number>();for(let i=0;i<m;i++){const kind=input.int(1,2),k=input.int(1,n);input.boundary();if((kind===1)===active.has(k))throw Error('invalid train presence transition');if(kind===1)active.add(k);else active.delete(k);}break;}
    case '70':{const n=input.int(1,200000),q=input.int(1,200000);input.boundary();for(let i=0;i<n;i++)if(!/^-?\d+$/.test(input.next()))throw Error('city must be an integer');input.boundary();for(let i=0;i<q;i++){input.int(1,n);input.int(1,n);input.int(0,1000000006);input.boundary();}break;}
    case '42':{const n=input.scalar(1,200000),times:number[]=[];for(let i=0;i<n;i++){const a=input.int(1,2*n),b=input.int(a+1,2*n);input.boundary();times.push(a,b);}unique(times);unique(input.array(input.scalar(1,n),1,n));break;}
    case '56':{const k=input.scalar(1,60),max=(1n<<BigInt(k))-1n,n=input.scalar(1,Number(max<2000n?max:2000n)),nodes:string[]=[];for(let i=0;i<n;i++){nodes.push(input.big(1n,max).toString());if(!['white','yellow','green','blue','red','orange'].includes(input.next()))throw Error('invalid cube color');input.boundary();}unique(nodes);break;}
    case '164':{const n=input.int(1,200000);input.int(1,n);input.boundary();input.word(/^[a-z]+$/,n,n);const d=new DSU(n),parents=new Int32Array(n+1);for(let i=1;i<=n;i++){const children=input.array(2,0,n);for(const child of children)if(child){if(child===1||++parents[child]!>1||!d.join(i,child))throw Error('input does not form a binary tree rooted at one');}}if(d.components!==1)throw Error('binary tree must be connected');break;}
    case '12':{const n=input.int(0,1999),m=input.int(0,1999);input.boundary();let some=false;for(let i=0;i<=n;i++){const s=input.characters(m+1,/^[01]+$/);if(s.includes('1'))some=true;}if(!some)throw Error('at least one telephone pole required');break;}
    case '77':{const n=input.int(1,1000),m=input.int(1,1000);input.boundary();const grid=Array.from({length:n},()=>input.array(m,0,15));for(let i=0;i<n;i++)for(let j=0;j<m;j++){const v=grid[i]![j]!;if((i===0&&!(v&8))||(i===n-1&&!(v&2))||(j===0&&!(v&1))||(j===m-1&&!(v&4)))throw Error('perimeter wall missing');if(j>0&&Boolean(v&1)!==Boolean(grid[i]![j-1]!&4))throw Error('adjacent tiles disagree about shared wall');if(i>0&&Boolean(v&8)!==Boolean(grid[i-1]![j]!&2))throw Error('adjacent tiles disagree about shared wall');}break;}
    case '9':{const n=input.int(1,1000),m=input.int(1,1000),k=input.int(1,100000);input.boundary();for(let i=0;i<n;i++){const row=input.array(m,1,3);if(row[0]===3||row.at(-1)===1)throw Error('invalid boundary arrow');}input.array(k,1,m);break;}
    case '110':{const n=input.scalar(3,100000);if(n%3)throw Error('n must be divisible by three');const seen=new Set<string>(),colors=[0,0,0];for(let i=0;i<n;i++){const x=input.int(-1e9,1e9),y=input.int(-1e9,1e9),c=input.int(1,3);input.boundary();const key=x+','+y;if(seen.has(key))throw Error('duplicate point');seen.add(key);colors[c-1]=colors[c-1]!+1;}if(colors.some(c=>c!==n/3))throw Error('colors must have equal counts');break;}
    case '69':{const n=input.int(1,50000),q=input.int(1,50000);input.boundary();const trees=[new RangeMinimum(input.array(n,0,1e6)),new RangeMinimum(input.array(n,0,1e6))];for(let i=0;i<q;i++){const kind=input.int(1,4),k=kind===4?0:input.int(1,2)-1,l=input.int(1,n),r=input.int(l,n);if(kind===4){input.boundary();continue;}const x=input.int(kind===3?-1e6:0,kind===3?1e6:1e9);input.boundary();trees[k]!.update(l-1,r-1,kind,x);}break;}
    case '68':{const n=input.scalar(1,100000),points:Point[]=[],seen=new Set<string>();for(let i=0;i<n;i++){const [x,y]=input.array(2,-1e9,1e9) as [number,number],key=x+','+y;if(seen.has(key))throw Error('duplicate bubble coordinates');seen.add(key);points.push([BigInt(x),BigInt(y)]);}const q=input.scalar(1,100000),queries:[number,number,number][]=[];for(let i=0;i<q;i++){const dx=input.int(-1e9,1e9),dy=input.int(-1e9,1e9),k=input.int(1,n);input.boundary();queries.push([dx,dy,k]);}bubbleGuarantees(points,queries);break;}
    case '112':{const n=input.int(2,100000),m=input.int(1,100000),q=input.int(1,100000);input.boundary();treeEdges(input,n,()=>{const c=input.next();if(!/^[a-z]$/.test(c))throw Error('invalid edge letter');});let sum=0;for(let i=0;i<m;i++){if(input.lineEnds[input.lineIndex]===input.position)throw new PendingContract('minimum word length is not specified');sum+=input.word(/^[a-z]+$/,1,100000).length;}if(sum>100000)throw Error('sum of word lengths exceeds statement');for(let i=0;i<q;i++){const u=input.int(1,n),v=input.int(1,n),l=input.int(1,m);input.int(l,m);input.boundary();if(u===v)throw Error('query endpoints must differ');}break;}
    case '84':{const t=input.scalar(1,300000);for(let i=0;i<t;i++){const n=input.int(1,100000);input.int(1,n);input.boundary();}break;}
    case '135':{const t=input.scalar(1,500);for(let i=0;i<t;i++){const n=input.int(1,100);input.int(0,Math.floor(n/2));input.boundary();input.array(n,1,200000);}break;}
    case '116':case '143':{const limit=id==='116'?500000:200000,t=input.scalar(1,id==='116'?100000:10000);let sum=0;for(let i=0;i<t;i++){const n=input.scalar(1,limit);sum+=n;if(sum>limit)throw Error('sum of n exceeds statement');input.array(n,0,n);}break;}
    case '108':{const t=input.scalar(1,100);let sum=0;for(let i=0;i<t;i++){const n=input.scalar(1,100000);sum+=n;if(sum>100000)throw Error('sum of n exceeds statement');unique(input.array(n,1,1e9));unique(input.array(n,1,1e9));}break;}
    case '18':case '47':case '80':{const t=input.scalar(1,id==='18'?1000:id==='47'?10500:10000),limit=id==='18'||id==='80'?1e6:200000;let sn=0,sm=0;for(let i=0;i<t;i++){const n=input.int(1,limit),m=input.int(1,id==='80'?1e6:n);input.boundary();sn+=n;sm+=m;if(sn>limit||(id==='80'&&sm>1e6))throw Error('aggregate length exceeds statement');input.array(n,id==='18'?0:id==='47'?-1e9:1,id==='18'?1:1e9);if(id==='80')input.array(m,1,1e9);}break;}
    case '20':{const t=input.scalar(1,80);let sn=0,sm=0;for(let i=0;i<t;i++){const n=input.int(5,400),m=input.int(4,400);input.boundary();sn+=n;sm+=m;if(sn>400||sm>400)throw Error('aggregate grid dimensions exceed statement');for(let j=0;j<n;j++)input.word(/^[01]+$/,m,m);}break;}
    case '142':{const t=input.scalar(1,10000);let sum=0;for(let i=0;i<t;i++){if(!input.blanks())throw Error('required empty case separator missing');const m=input.int(1,50000),n=input.int(2,100000);input.boundary();sum+=m*n;if(m*n>100000||sum>100000)throw Error('matrix product bound violated');for(let j=0;j<m;j++)input.array(n,1,1e9);}break;}
    case '145':{const t=input.scalar(1,10000);let sum=0;for(let i=0;i<t;i++){if(!input.blanks())throw Error('required empty case separator missing');const n=input.int(1,200000);input.int(0,1e9);input.boundary();sum+=n;if(sum>200000)throw Error('sum of n exceeds statement');const seen=new Set<string>();for(let j=0;j<n;j++){const x=input.int(-1e9,1e9),y=input.int(-1e9,1e9);input.int(0,1e9);input.boundary();const key=x+','+y;if(seen.has(key))throw Error('duplicate mine coordinates');seen.add(key);}}break;}
    case '124':{const t=input.scalar(1,1000);let sum=0;for(let i=0;i<t;i++){const n=input.scalar(2,2000);sum+=n;if(sum>2000)throw Error('sum of n exceeds statement');input.word(/^[01?]+$/,n,n);input.word(/^[01?]+$/,n,n);}break;}
    case '149':{const t=input.scalar(1,2000);let sum=0;for(let i=0;i<t;i++){const n=input.int(1,2000),k=input.int(0,2000),x=input.big(1n,10n**18n);input.boundary();sum+=n;if(sum>2000)throw Error('sum of n exceeds statement');const s=input.word(/^[a*]+$/,n,n);if(!s.includes('a'))throw Error('at least one a required');let count=1n;for(const g of s.match(/\*+/g)??[]){count*=BigInt(g.length*k+1);if(count>=x){count=x;break;}}if(count<x)throw Error('rank exceeds distinct BA-string count');}break;}
    case '86':{const t=input.scalar(1,100000);let sum=0;for(let i=0;i<t;i++){input.int(1,1e9);const k=input.int(0,1e7);input.int(0,2**Math.min(20,k)-1);input.boundary();sum+=k;if(sum>5e7)throw Error('sum of k exceeds statement');}break;}
    case '163':{const t=input.scalar(1,10);for(let i=0;i<t;i++){const n=input.int(2,50000),m=input.int(2,50000);if(n*m>100000)throw Error('room product exceeds statement');input.int(1,n);input.int(1,m);input.int(1,n);input.int(1,m);input.int(1,99);input.boundary();}break;}
    case '66':{const t=input.scalar(1,10000);for(let i=0;i<t;i++){const n=input.big(2n,10n**18n);input.boundary();input.big(0n,n-1n);input.big(0n,n-1n);input.boundary();const a=input.next(),b=input.next();input.boundary();if(!['left','right'].includes(a)||!['left','right'].includes(b))throw Error('invalid direction token');}break;}
    case '54':{const t=input.scalar(1,10000);let sn=0,sm=0;for(let i=0;i<t;i++){const n=input.int(1,200000),m=input.int(0,500000);input.boundary();sn+=n;sm+=m;if(sn>200000||sm>500000)throw Error('aggregate comment bound exceeded');for(let j=0;j<m;j++){const u=input.int(1,n),v=input.int(1,n),c=input.next();input.boundary();if(u===v||!['imposter','crewmate'].includes(c))throw Error('invalid comment');}}break;}
    default:return false;
  }return true;
}
/** Only statement-specific proved contracts may produce invalid. Unknown = pending. */
export function validateInput(sourceId:string,text:string):Check {
  if(!Object.hasOwn(REVIEWED_SOURCE_HASHES,sourceId))return {status:'pending'};
  try{
    const input=new Input(text);
    if(!['0','8','19','91'].includes(sourceId)){if(!additional(input,sourceId))return {status:'pending'};input.end();return valid;}
    if(sourceId==='0'){
      const n=input.int(1,1e6),m=input.int(1,1e6);input.boundary();if(n*m>1e6)throw Error('n*m exceeds 1000000');
      const seen=new Set<string>();
      for(let i=0;i<n;i++){const title=input.next();input.boundary();if(title.length!==m)throw Error('title length differs from m');if(!/^[A-Z]+$/.test(title))throw Error('title is not uppercase Latin');if(seen.has(title))throw Error('titles are not pairwise distinct');seen.add(title);}
    }else if(sourceId==='8'){
      const n=input.int(2,100000),q=input.int(1,100000);input.boundary();
      for(let i=0;i<n;i++)input.int(-1e9,1e9);input.boundary();
      const parent=Array.from({length:n},(_,i)=>i);
      const find=(v:number):number=>{while(parent[v]!==v){parent[v]=parent[parent[v]!]!;v=parent[v]!;}return v;};
      for(let i=1;i<n;i++){const a=find(input.int(1,n)-1),b=find(input.int(1,n)-1);input.boundary();if(a===b)throw Error('edges do not form a tree');parent[a]=b;}
      for(let i=0;i<q;i++){const kind=input.int(1,2);input.int(1,n);input.int(kind===1?-1e9:1,kind===1?1e9:n);input.boundary();}
    }else{
      const maximum=sourceId==='19'?10000:100000,t=input.int(1,sourceId==='19'?1000:10000);input.boundary();let sum=0;
      for(let test=0;test<t;test++){const n=input.int(1,maximum);input.boundary();sum+=n;if(sum>maximum)throw Error('sum of n exceeds '+maximum);for(let i=0;i<n;i++)input.int(1,sourceId==='19'?1000:100000);input.boundary();}
    }
    input.end();return valid;
  }catch(error){return error instanceof PendingContract?{status:'pending'}:{status:'invalid',reason:(error as Error).message};}
}

/** Enumerate all directions; this oracle does not use any submitted/reference code. */
function coverageMinimum(values:number[]){
  if(!values.length||values.length>10||values.some(v=>!Number.isInteger(v)||v<1||v>1000))throw Error('ORACLE_INPUT_OUT_OF_BOUNDS');
  let minimum=Infinity;
  for(let mask=0;mask<2**values.length;mask++){
    let x=0,lo=0,hi=0;
    for(let i=0;i<values.length;i++){x+=((mask>>i)&1?1:-1)*values[i]!;lo=Math.min(lo,x);hi=Math.max(hi,x);}
    minimum=Math.min(minimum,hi-lo);
  }
  return {values,minimum,arrangements:2**values.length};
}
export function coverageCases(){
  const values:number[][]=[];
  function enumerate(prefix:number[],n:number){if(prefix.length===n){values.push(prefix);return;}for(let i=1;i<=4;i++)enumerate([...prefix,i],n);}
  for(let n=1;n<=4;n++)enumerate([],n);
  // Fixed formula, no run-time randomness or model-performance selection.
  for(let n=5;n<=10;n++)for(let k=0;k<12;k++)values.push(Array.from({length:n},(_,j)=>1+((k+1)*131+(j+1)*263+j*k*73)%1000));
  values.push([919,262,337,976,347,18,805]);
  const proof=values.map(coverageMinimum);
  const test={stdin:values.length+'\n'+values.map(v=>v.length+'\n'+v.join(' ')).join('\n')+'\n',expected:proof.map(p=>p.minimum).join('\n')+'\n'};
  return {test,proof,oracle:'all 2^n segment orientations, exact integer union width; n<=10',proofHash:identityHash(proof)};
}
export function sortingCases(){
  const corpora=[['Z','A'],['M','Z','A'],['ABA','AZZ','AAA','ZAA','AAZ','MAZ'],['AA','AZ','ZA','ZZ'],['AZAZ','AZZA','AAAA','ZZZZ'],['Z']];
  return corpora.map(titles=>{
    // Direct statement comparator: first differing position determines the order.
    const order=titles.map((_,i)=>i).sort((a,b)=>{
      for(let j=0;j<titles[a]!.length;j++){
        const delta=titles[a]!.charCodeAt(j)-titles[b]!.charCodeAt(j);
        if(delta)return j%2?-delta:delta;
      }return 0;
    });
    return {test:{stdin:titles.length+' '+titles[0]!.length+'\n'+titles.join('\n')+'\n',expected:order.map(i=>i+1).join(' ')+'\n'},
      oracle:'exact first-different-character ordering from statement, alternating ascending/descending per word',proofHash:identityHash({titles,order}),subcases:1};
  });
}
/** Fixed public-statement boundary coverage, not generated from any model answers. */
export function boundaryCases(sourceId:string){
  if(sourceId==='47')return [{test:{stdin:'1\n1 1\n-1\n',expected:'1\n'},oracle:'one item at coordinate-1: travel-distance lower bound1 is attained by one non-returning trip',proofHash:identityHash({position:-1,capacity:1,lowerBound:1,route:[0,-1]}),subcases:1}];
  if(sourceId==='56')return [{test:{stdin:'6\n1\n2 white\n',expected:String(4n**62n%1000000007n)+'\n'},oracle:'63-node binary tree with one fixed non-root color: root has4 compatible colors and61 other nodes independently have4 colors; exact4^62 moduloP',proofHash:identityHash({nodes:63,fixedNode:2,choices:4,exponent:62,modulus:1000000007}),subcases:1}];
  if(sourceId==='59'){
    const availability=[[1,1,0,0,0],[1,1,0,0,0],[0,1,0,0,0],[1,0,0,0,0]];let possible=false;
    for(let a=0;a<5;a++)for(let b=a+1;b<5;b++)for(let mask=0;mask<16;mask++)if(mask.toString(2).replaceAll('0','').length===2&&availability.every((row,i)=>row[mask&(1<<i)?a:b]===1))possible=true;
    return [{test:{stdin:'1\n4\n'+availability.map(row=>row.join(' ')).join('\n')+'\n',expected:possible?'YES\n':'NO\n'},oracle:'exhaust every weekday pair and every balanced assignment of four students, without greedy choices',proofHash:identityHash({availability,assignments:60,possible}),subcases:1}];
  }
  if(sourceId==='77')return [
    [[9,12],[3,6]],
    [[9,...Array<number>(998).fill(10),12],[3,...Array<number>(998).fill(10),6]]
  ].map(grid=>{
    const n=grid.length,m=grid[0]!.length,seen=new Set<number>(),rooms:number[]=[];
    for(let start=0;start<n*m;start++)if(!seen.has(start)){
      seen.add(start);const queue=[start];for(const at of queue){const r=Math.floor(at/m),c=at%m;for(const [dr,dc,bit] of [[-1,0,8],[0,1,4],[1,0,2],[0,-1,1]]){const nr=r+dr!,nc=c+dc!;if(nr<0||nr>=n||nc<0||nc>=m||(grid[r]![c]!&bit!))continue;const next=nr*m+nc;if(!seen.has(next)){seen.add(next);queue.push(next);}}}rooms.push(queue.length);
    }
    rooms.sort((a,b)=>b-a);const test={stdin:n+' '+m+'\n'+grid.map(row=>row.join(' ')).join('\n')+'\n',expected:rooms.join(' ')+'\n'};
    return {test,oracle:'literal cell-neighbor BFS on small and2000-cell cycles, counting each cell exactly once; cycles are not treated as trees',proofHash:identityHash({grid,rooms}),subcases:1};
  });
  if(sourceId==='78')return [10,100].map(n=>{
    const factors=Array.from({length:n},(_,i)=>i+1).filter(k=>n%k===0);
    return {test:{stdin:'1\n'+n+'\n'+Array(n).fill(1).join(' ')+'\n',expected:factors.join(' ')+'\n'},oracle:'all values1: each effective operation eliminates exactlyk ones, hence k must and may divide n; output increasing factors',proofHash:identityHash({n,ones:n,factors}),subcases:1};
  });
  if(sourceId==='87'){
    const a=[2,1,3],minimum=Math.max(0,...a.map((x,i)=>x-i-1));
    return [{test:{stdin:'1\n3\n'+a.join(' ')+'\n',expected:minimum+'\n'},oracle:'each original element needs at least a_i-i preceding insertions; inserting that many1s at the front attains the bound',proofHash:identityHash({a,minimum,witness:[1,2,1,3]}),subcases:1}];
  }
  if(sourceId==='9'){
    const original=[[2,3],[1,2]],grid=original.map(row=>[...row]),balls=[1,2],exits:number[]=[];
    for(const start of balls){let r=0,c=start-1;while(r<grid.length){const direction=grid[r]![c]!;grid[r]![c]=2;if(direction===1)c++;else if(direction===3)c--;else r++;}exits.push(c+1);}
    return [{test:{stdin:'2 2 2\n'+original.map(row=>row.join(' ')).join('\n')+'\n'+balls.join(' ')+'\n',expected:exits.join(' ')+'\n'},oracle:'literal step-by-step ball motion, replacing each visited arrow by down; never infer an entire visited column prefix',proofHash:identityHash({original,balls,exits}),subcases:balls.length}];
  }
  if(sourceId==='94'){
    const exponent=0,k=2,answer=(BigInt(k)+1n)*10n**BigInt(exponent);
    return [{test:{stdin:'1\n1 2\n0\n',expected:answer+'\n'},oracle:'one denomination10^a: minimum coin count is exactly s/10^a, so first amount needing more thank coins is(k+1)*10^a',proofHash:identityHash({exponent,k,answer:String(answer)}),subcases:1}];
  }
  if(sourceId==='20'){
    const small=['01100','10010','10010','10010','10010','01100'];
    const grid=Array.from({length:60},()=>Array<string>(60).fill('0'));
    for(let c=1;c<8;c++){grid[0]![c]='1';grid[9]![c]='1';}for(let r=1;r<9;r++){grid[r]![0]='1';grid[r]![8]='1';}
    const matrices=[small,grid.map(row=>row.join(''))],witnesses=[[0,5,0,3],[0,9,0,8]];
    matrices.forEach((matrix,i)=>{const [top,bottom,left,right]=witnesses[i]!;for(let r=top!;r<=bottom!;r++)for(let c=left!;c<=right!;c++){
      if((r===top||r===bottom)&&(c===left||c===right))continue;
      const required=r===top||r===bottom||c===left||c===right?'1':'0';if(matrix[r]![c]!==required)throw Error('ORACLE_ZERO_WITNESS_FAILED');
    }});
    const test={stdin:'2\n'+matrices.map(matrix=>matrix.length+' '+matrix[0]!.length+'\n'+matrix.join('\n')).join('\n')+'\n',expected:'0\n0\n'};
    return [{test,oracle:'nonnegative edit cost plus explicitly checked zero-cost portal witnesses; one crosses both height9 and width8 heuristic limits',proofHash:identityHash({matrices,witnesses}),subcases:2}];
  }
  if(sourceId==='33'||sourceId==='34')return [[4,7,3,5],[0,0],[7,3,5],[0,1,2,3],[5,4,3,2,1],[1,2,4,8]].map(values=>{
    const results=new Set([0]);for(let mask=1;mask<2**values.length;mask++){
      const sequence=values.filter((_,i)=>mask&(1<<i));if(sequence.some((x,i)=>i>0&&x<=sequence[i-1]!))continue;results.add(sequence.reduce((x,y)=>x^y,0));
    }
    const sorted=[...results].sort((a,b)=>a-b),test={stdin:values.length+'\n'+values.join(' ')+'\n',expected:sorted.length+'\n'+sorted.join(' ')+'\n'};
    return {test,oracle:'enumerate every subsequence by original position; require strict value increase and XOR directly, including improving an existing XOR tail',proofHash:identityHash({values,subsets:2**values.length,sorted}),subcases:1};
  });
  if(sourceId==='142')return [
    [[3,2,1],[1,3,1],[1,1,3]],[[2,1],[1,2]],[[1,1],[1,1]],[[5,1,4],[2,5,1],[1,2,5],[4,4,4]]
  ].map(matrix=>{
    const shops=matrix.length,friends=matrix[0]!.length;let best=0;
    for(let mask=1;mask<2**shops;mask++){
      const selected=matrix.filter((_,i)=>mask&(1<<i));if(selected.length>=friends)continue;
      best=Math.max(best,Math.min(...Array.from({length:friends},(_,j)=>Math.max(...selected.map(row=>row[j]!)))));
    }
    const test={stdin:'1\n\n'+shops+' '+friends+'\n'+matrix.map(row=>row.join(' ')).join('\n')+'\n',expected:best+'\n'};
    return {test,oracle:'enumerate every nonempty shop subset of size at most friends-1 and directly maximize minimum available gift joy',proofHash:identityHash({matrix,best}),subcases:1};
  });
  if(sourceId==='145')return [
    {k:1,mines:[[0,2,1],[1,2,1]]},{k:1,mines:[[2,0,1],[2,1,1]]},
    {k:0,mines:[[0,0,5],[1,1,5],[2,2,5]]},{k:2,mines:[[0,0,4],[0,2,3],[2,2,5],[4,7,8]]}
  ].map(({k,mines})=>{
    const n=mines.length,components=mines.map((_,i)=>{
      const pending=[i],seen=new Set([i]);
      while(pending.length){const x=pending.pop()!,[a,b]=mines[x]!;for(let j=0;j<n;j++){const [c,d]=mines[j]!;if(!seen.has(j)&&((a===c&&Math.abs(b!-d!)<=k)||(b===d&&Math.abs(a!-c!)<=k))){seen.add(j);pending.push(j);}}}
      return [...seen].reduce((mask,j)=>mask|(1<<j),0);
    });
    let states=new Set([0]),answer=-1;
    for(let second=0;second<n;second++){
      let automatic=0;mines.forEach((mine,i)=>{if(mine[2]!<=second)automatic|=components[i]!;});
      const next=new Set<number>();for(const state of states){next.add(state|automatic);for(const component of components)next.add(state|automatic|component);}
      if(next.has((1<<n)-1)){answer=second;break;}states=next;
    }
    const test={stdin:'1\n\n'+n+' '+k+'\n'+mines.map(m=>m.join(' ')).join('\n')+'\n',expected:answer+'\n'};
    return {test,oracle:'direct pairwise explosion graph; enumerate all per-second manual choices and automatic component explosions',proofHash:identityHash({k,mines,components,answer}),subcases:1};
  });
  if(sourceId==='146')return [
    {initial:Array.from({length:100},(_,i)=>i+1),ops:[[1,1,2],[2,1,100]]},
    {initial:Array.from({length:101},(_,i)=>i+1),ops:[[1,1,2],[2,1,101],[1,1,2],[2,2,100],[1,3,4],[2,3,101]]},
    {initial:Array.from({length:100},(_,i)=>(i+1)%100+1),ops:[[2,1,100],[1,1,51],[2,1,100],[2,51,99],[1,1,51],[2,1,100]]}
  ].map(({initial,ops})=>{
    const p=[0,...initial],answers:number[]=[];
    for(const [kind,x,y] of ops){if(kind===1)[p[x!],p[y!]]=[p[y!]!,p[x!]!];else{let at=x!;for(let j=0;j<y!;j++)at=p[at]!;answers.push(at);}}
    const test={stdin:initial.length+' '+ops.length+'\n'+initial.join(' ')+'\n'+ops.map(o=>o.join(' ')).join('\n')+'\n',expected:answers.join('\n')+'\n'};
    return {test,oracle:'maintain the full permutation; perform every queried application directly, including 100-step jump boundary and repeated swaps',proofHash:identityHash({initial,ops,answers}),subcases:ops.filter(o=>o[0]===2).length};
  });
  if(sourceId==='11')return [[1],[2],[1,1],[2,2],[2,1],[1,2,2,3],[3,3,3],[1,1,2,2],[2,1,4,2,5,3,7]].map(values=>{
    let best=0;
    for(let mask=0;mask<2**values.length;mask++){
      let position=0,matches=0;
      for(let i=0;i<values.length;i++)if(mask&(1<<i)){position++;if(values[i]===position)matches++;}
      best=Math.max(best,matches);
    }
    const test={stdin:values.length+'\n'+values.join(' ')+'\n',expected:best+'\n'};
    return {test,oracle:'exhaustively enumerate every retained-position subset and count a_i=i directly',proofHash:identityHash({values,subsets:2**values.length,best}),subcases:1};
  });
  if(sourceId==='109')return ['BB','BW','B?','WB','WW','W?','?B','?W','??'].map(x=>[x]).concat([['BW','WB'],['BB','WW'],['BB','??'],['??','??'],['??','??','??'],['BB','??','W?','??']]).map(dominoes=>{
    const cells=dominoes.join('').split(''),unknown=cells.flatMap((c,i)=>c==='?'?[i]:[]);let valid=0;
    const feasible=(remaining:number[],order:number[]):boolean=>{
      if(!remaining.length)return order.every((i,j)=>cells[2*i+1]!==cells[2*order[(j+1)%order.length]!]!);
      return remaining.some((i,j)=>feasible(remaining.filter((_,k)=>k!==j),[...order,i]));
    };
    for(let mask=0;mask<2**unknown.length;mask++){
      unknown.forEach((at,i)=>{cells[at]=mask&(1<<i)?'B':'W';});
      if(feasible(dominoes.map((_,i)=>i),[]))valid++;
    }
    const test={stdin:dominoes.length+'\n'+dominoes.join('\n')+'\n',expected:valid+'\n'};
    return {test,oracle:'enumerate every unknown-cell coloring and every unrotated domino permutation; check all cyclic seams directly',proofHash:identityHash({dominoes,colorings:2**unknown.length,valid}),subcases:1};
  });
  if(sourceId==='119')return [[1,1,3,3],[1,1,1,5],[2,4],[1,2,2]].map(values=>{
    // Enumerate the actual move graph, not the divisibility formula used by references.
    const initial=[...values].sort((a,b)=>a-b),queue=[initial],seen=new Set([initial.join(',')]);let best=Infinity;
    for(const state of queue){
      best=Math.min(best,state.at(-1)!-state[0]!);
      for(let i=0;i<state.length;i++)if(state[i]!>0)for(let j=0;j<state.length;j++)if(i!==j){
        const next=[...state];next[i]!--;next[j]!++;next.sort((a,b)=>a-b);const key=next.join(',');
        if(!seen.has(key)){seen.add(key);queue.push(next);}
      }
    }
    const test={stdin:'1\n'+values.length+'\n'+values.join(' ')+'\n',expected:best+'\n'};
    return {test,oracle:'enumerate every reachable tower-height multiset using literal one-block transfers; take the minimum exact max-minus-min, without divisibility shortcut',proofHash:identityHash({values,reachableStates:seen.size,best}),subcases:1};
  });
  return [];
}
export function adaptContest(source:ContestSource){
  if(Object.hasOwn(REVIEWED_SOURCE_HASHES,source.sourceId)&&REVIEWED_SOURCE_HASHES[source.sourceId]!==source.sourceRecordHash)throw Error('VALIDATOR_STATEMENT_CHANGED');
  const flattened:TestCase[]=[],origins:('public'|'private'|'generated')[]=[];
  for(const origin of ['public','private','generated'] as const){const tests=source.raw[`${origin}_tests`];
    if(tests.input.length!==tests.output.length)throw Error('SOURCE_CASE_SHAPE');
    tests.input.forEach((stdin,i)=>{flattened.push({stdin,expected:tests.output[i]!});origins.push(origin);});
  }
  if(identityHash(flattened)!==identityHash(source.cases))throw Error('SOURCE_CASE_MISMATCH');
  const cases:TestCase[]=[],excluded:{sourceIndex:number;origin:string;originalHash:string;reason:string}[]=[],kept:{sourceIndex:number;caseHash:string;origin:string}[]=[];
  let pending=false;
  source.cases.forEach((original,sourceIndex)=>{
    const result=validateInput(source.sourceId,original.stdin),origin=origins[sourceIndex]!;
    if(result.status==='invalid'){
      if(origin!=='generated')throw Error('NON_GENERATED_INVALID:'+source.sourceId+':'+sourceIndex+':'+result.reason);
      excluded.push({sourceIndex,origin,originalHash:identityHash(original),reason:result.reason});
    }else{pending||=result.status==='pending';cases.push({...original});kept.push({sourceIndex,caseHash:identityHash(original),origin});}
  });
  if(!cases.length)throw Error('NO_LEGAL_ORIGINAL_TESTS');
  const added:{caseHash:string;oracle:string;proofHash:string;subcases:number}[]=[];
  if(source.sourceId==='19'){
    const extra=coverageCases();if(validateInput('19',extra.test.stdin).status!=='valid')throw Error('INVALID_ORACLE_TEST');
    cases.push(extra.test);added.push({caseHash:identityHash(extra.test),oracle:extra.oracle,proofHash:extra.proofHash,subcases:extra.proof.length});
  }
  if(source.sourceId==='0')for(const extra of sortingCases()){
    if(validateInput('0',extra.test.stdin).status!=='valid')throw Error('INVALID_ORACLE_TEST');
    cases.push(extra.test);added.push({caseHash:identityHash(extra.test),oracle:extra.oracle,proofHash:extra.proofHash,subcases:extra.subcases});
  }
  for(const extra of boundaryCases(source.sourceId)){
    if(validateInput(source.sourceId,extra.test.stdin).status!=='valid')throw Error('INVALID_ORACLE_TEST');
    cases.push(extra.test);added.push({caseHash:identityHash(extra.test),oracle:extra.oracle,proofHash:extra.proofHash,subcases:extra.subcases});
  }
  return {sourceId:source.sourceId,sourceRecordHash:source.sourceRecordHash,policy:ADAPTATION_VERSION,status:pending?'pending' as const:'audited' as const,
    originalHash:identityHash(source.cases),adaptedHash:identityHash(cases),originalCount:source.cases.length,kept,excluded,added,cases};
}
