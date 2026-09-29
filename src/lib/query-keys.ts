export function getTagDeleteInvalidationKeys(): readonly (readonly string[])[] {
  return [['tags'], ['contacts'], ['contact'], ['dueContacts']]
}
