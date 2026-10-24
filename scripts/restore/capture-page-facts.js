selectors => {
  const rectValue = rect => ({x:rect.x,y:rect.y,width:rect.width,height:rect.height});
  const intersectionValue = rect => {
    const x=Math.min(innerWidth,Math.max(0,rect.left)),y=Math.min(innerHeight,Math.max(0,rect.top));
    const right=Math.min(innerWidth,rect.right),bottom=Math.min(innerHeight,rect.bottom);
    return {x,y,width:Math.max(0,right-x),height:Math.max(0,bottom-y)};
  };
  const region = selector => {
    const el=document.querySelector(selector);
    if(!el) return {selector,missing:true,visible:false,visibility_reasons:['missing'],rect:null,client_rect:null,
      intersection:null,display:null,visibility:null,opacity:null,aria_hidden:null,hidden:null,style:null,text:null};
    const bounds=el.getBoundingClientRect(),rect=rectValue(bounds),intersection=intersectionValue(bounds),style=getComputedStyle(el);
    const reasons=[];
    for(let current=el;current;current=current.parentElement) {
      const own=current===el,prefix=own?'':'ancestor_';
      const currentStyle=getComputedStyle(current),opacity=Number.parseFloat(currentStyle.opacity);
      if(current.hasAttribute('hidden')) reasons.push(prefix+'hidden_attribute');
      if(current.getAttribute('aria-hidden')?.trim().toLowerCase()==='true') reasons.push(prefix+'aria_hidden');
      if(currentStyle.display==='none') reasons.push(prefix+'display_none');
      if(['hidden','collapse'].includes(currentStyle.visibility)) reasons.push(prefix+'visibility_'+currentStyle.visibility);
      if(Number.isFinite(opacity)&&opacity<=0) reasons.push(prefix+'opacity_zero');
    }
    if(rect.width<=0||rect.height<=0) reasons.push('zero_client_rect');
    if(intersection.width<=0||intersection.height<=0) reasons.push('outside_viewport');
    const aria=el.getAttribute('aria-hidden');
    return {selector,missing:false,visible:reasons.length===0,visibility_reasons:[...new Set(reasons)],rect,client_rect:{...rect},intersection,
      display:style.display,visibility:style.visibility,opacity:Number.parseFloat(style.opacity),
      aria_hidden:aria==null?null:aria.trim().toLowerCase()==='true',hidden:el.hasAttribute('hidden'),
      style:{fontFamily:style.fontFamily,fontSize:style.fontSize,color:style.color,backgroundColor:style.backgroundColor},
      text:(el.textContent??'').slice(0,500)};
  };
  return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},url:location.href,title:document.title,
    overflow:document.documentElement.scrollWidth>innerWidth,fonts:document.fonts.status,
    broken_images:[...document.images].filter(image=>image.complete&&!image.naturalWidth).map(image=>image.currentSrc),
    regions:selectors.map(region)};
}
