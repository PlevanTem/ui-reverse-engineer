export async function closeCaptureResources(page,context,closeContext) {
  const errors=[];
  if(page)try{await page.close();}catch(error){errors.push(`page.close: ${error.message}`);}
  if(closeContext&&context)try{await context.close();}catch(error){errors.push(`context.close: ${error.message}`);}
  return errors;
}
