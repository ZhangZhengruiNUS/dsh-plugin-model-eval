export type ActivityKind='evaluation'|'speed-preview'|'prepare'|'root-change'|'cleanup';
export interface ActivityView {kind:ActivityKind;id:string;state:'running'|'stopping'|'faulted';errorCode?:string}
export interface ActivityLease {identify(id:string):void;stopping():void;fault(code:string):void;release():void}
export function createActivityGate(){
 let active:{view:ActivityView;token:symbol}|undefined;
 return {snapshot:():ActivityView|undefined=>active?structuredClone(active.view):undefined,
  claim(kind:ActivityKind,id:string):ActivityLease {if(active)throw Object.assign(new Error('ACTIVITY_BUSY'),{code:'ACTIVITY_BUSY'});const token=Symbol(id);active={view:{kind,id,state:'running'},token};const current=()=>active?.token===token?active.view:undefined;
   return {identify(id){const view=current();if(view)view.id=id;},stopping(){const view=current();if(view&&view.state!=='faulted')view.state='stopping';},fault(code){const view=current();if(view){view.state='faulted';view.errorCode=/^[A-Z][A-Z0-9_]{1,70}$/.test(code)?code:'ACTIVITY_FAILED';}},release(){if(current())active=undefined;}};
  }};
}
