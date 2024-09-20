export interface EntityPropertyDto {
  category: String;
  nestTcpUrl: String; 
  // entityGroup: String;
  // entityName: String;
  // maxFileSizeBytes: Number;
  // acceptedType: String[];
  // volatileAtInitialized: Boolean;
}

export interface EntityPropertySearchDto {
  entityGroup: String;
  entityName: String;
}
