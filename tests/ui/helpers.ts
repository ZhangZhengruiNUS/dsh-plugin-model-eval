import type {Locator} from '@playwright/test';
export async function chooseModel(dialog:Locator,index=0,label='选择宿主模型'){
  await dialog.getByRole('combobox',{name:label,exact:true}).click();
  await dialog.getByRole('listbox').getByRole('option').nth(index).click();
}
