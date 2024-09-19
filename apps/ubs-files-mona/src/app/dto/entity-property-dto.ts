export interface EntityPropertyDto {
  entityGroup: String;
  entityName: String;
  maxFileSizeBytes: number;
  acceptedType: String[];
  volatileAtInitialized: Boolean;
}

export interface EntityPropertySearchDto {
  entityGroup: String;
  entityName: String;
}
