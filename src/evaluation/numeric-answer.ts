export interface ExactNumber {numerator:bigint;denominator:bigint}
function parse(body:string):ExactNumber|undefined {
  if(!body||body.length>500||!/^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][-+]?\d{1,3})?(?:\/[-+]?\d+)?$/.test(body))return undefined;
  const [left,divisor]=body.replaceAll(',','').split('/'),[decimal,exp='0']=left!.toLowerCase().split('e');
  const power=Number(exp)-(decimal!.split('.')[1]?.length??0);if(Math.abs(power)>1000)return undefined;
  let numerator=BigInt(decimal!.replace('.','')),denominator=divisor===undefined?1n:BigInt(divisor);if(!denominator)return undefined;
  if(power>=0)numerator*=10n**BigInt(power);else denominator*=10n**BigInt(-power);
  if(denominator<0n){numerator=-numerator;denominator=-denominator;}
  let a=numerator<0n?-numerator:numerator,b=denominator;while(b){const next=a%b;a=b;b=next;}
  return {numerator:numerator/a,denominator:denominator/a};
}
export function extractExactNumber(text:string):ExactNumber|undefined {
  if(text.length>2*1024*1024)return undefined;
  const last=text.trimEnd().slice(text.trimEnd().lastIndexOf('\n')+1).trim();
  if(last.length>520)return undefined;const match=/^Final answer:\s*(.+)$/.exec(last);return match?parse(match[1]!.trim()):undefined;
}
export function numericAnswerMatches(text:string,expected:string):boolean {
  const actual=extractExactNumber(text),want=parse(expected.trim());return !!actual&&!!want&&actual.numerator===want.numerator&&actual.denominator===want.denominator;
}
