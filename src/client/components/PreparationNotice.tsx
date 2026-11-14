import * as React from 'react';
import {Button,type LocalPreparation,type PageProps} from '../ui.tsx';

export function PreparationNotice({api,act,disabled,externalPreparing=false,message,generalId}:{api:PageProps['api'];act:PageProps['act'];disabled:boolean;externalPreparing?:boolean;message:string;generalId:string}){
 const [pending,setPending]=React.useState(false),preparing=pending||externalPreparing;
 async function prepare(){if(preparing||disabled)return;setPending(true);try{await act(()=>api('prepare',{generalId}));}finally{setPending(false);}}
 return <div className="me-inline-warning" aria-busy={preparing} role={preparing?'status':undefined}>
  <span>{preparing?'正在准备评测环境…':message}</span>
  <Button onClick={()=>void prepare()} disabled={disabled||preparing}>{preparing?'准备中…':'准备评测环境'}</Button>
  {preparing&&<p className="me-help">正在校验本地题集，首次准备可能需要几分钟。</p>}
 </div>;
}

const preparationReasons:Record<string,string>={
  ROOT_INSUFFICIENT_SPACE:'数据目录所在磁盘空间不足。请释放空间或切换目录后重试。',
  ENOSPC:'数据目录所在磁盘空间不足。请释放空间或切换目录后重试。',
  HISTORY_READ_ONLY:'当前数据目录只读或正由另一实例使用。请检查目录后重试。',
  EACCES:'无法写入当前数据目录。请检查目录权限或切换目录。',
  EPERM:'无法写入当前数据目录。请检查目录权限或切换目录。',
  RESOURCE_HASH_MISMATCH:'内置评分资源未通过完整性校验。请检查插件安装后重试。',
  CATALOG_HASH_MISMATCH:'内置评分资源未通过完整性校验。请检查插件安装后重试。',
  RESOURCE_LINK_REJECTED:'本地评分资源路径未通过校验。请检查数据目录后重试。',
  PREPARED_VERSION_MISMATCH:'本地评分资源版本不匹配。请检查数据目录后重试。',
  ENVIRONMENT_SELFCHECK_FAILED:'本地评分环境未通过自检。请检查插件安装后重试。',
  ENVIRONMENT_NOT_PREPARED:'未能完成本地评分资源准备，请重试。',
};
const directoryErrors=new Set(['ROOT_INSUFFICIENT_SPACE','ENOSPC','HISTORY_READ_ONLY','EACCES','EPERM','RESOURCE_LINK_REJECTED','PREPARED_VERSION_MISMATCH']);

export function LocalPreparationNotice({state,retry,settings,disabled}:{state:LocalPreparation;retry():void;settings():void;disabled:boolean}){
  if(state.phase==='pending')return <div className="me-active-banner" role="status"><span className="me-pulse"/>正在准备本地评分资源…</div>;
  const code=state.code??'';
  const selfcheck=code.match(/^ENVIRONMENT_SELFCHECK_(CODE|RULE|CONTEST)_(.+)$/);
  const stage=selfcheck&&{CODE:'代码运行',RULE:'规则评分',CONTEST:'竞赛代码评分'}[selfcheck[1] as 'CODE'|'RULE'|'CONTEST'];
  const message=stage?`本地${stage}自检${selfcheck?.[2]==='TIMEOUT'?'超时':'未通过'}。请重试准备。`:preparationReasons[code]??state.reason??'本地评分资源尚未准备，请重试。';
  return <div className="me-inline-warning">
    <p role="alert">{message}</p>
    <div className="me-actions">
      <Button onClick={retry} disabled={disabled}>重试准备</Button>
      {directoryErrors.has(code)&&<Button kind="text" onClick={settings}>打开设置</Button>}
    </div>
  </div>;
}
