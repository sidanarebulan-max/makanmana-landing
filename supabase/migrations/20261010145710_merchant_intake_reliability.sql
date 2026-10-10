CREATE OR REPLACE FUNCTION public.finalize_merchant_intake_v3(p_draft_id uuid, p_reference_code text, p_payload jsonb, p_menu_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_registration uuid := gen_random_uuid();
  v_draft public.merchant_intake_drafts%rowtype;
  v_evidence public.merchant_intake_draft_files%rowtype;
  v_evidence_type text := p_payload->>'evidenceType';
  v_evidence_deferred boolean := coalesce((p_payload->>'evidenceDeferred')::boolean,false);
  v_maps text := nullif(btrim(coalesce(p_payload->>'googleMapsUrl','')), '');
  v_lat double precision := nullif(p_payload->>'latitude','')::double precision;
  v_lng double precision := nullif(p_payload->>'longitude','')::double precision;
  v_processing boolean := coalesce((p_payload->>'processingConsent')::boolean,false);
  v_privacy boolean := coalesce((p_payload->>'privacyNoticeAccepted')::boolean,false);
  v_terms boolean := coalesce((p_payload->>'termsAccepted')::boolean,false);
  v_accuracy boolean := coalesce((p_payload->>'accuracyConfirmed')::boolean,false);
  v_marketing boolean := coalesce((p_payload->>'marketingOptIn')::boolean,false);
  v_consent_version text := nullif(p_payload->>'consentVersion','');
  v_privacy_version text := nullif(p_payload->>'privacyNoticeVersion','');
  v_terms_version text := nullif(p_payload->>'termsVersion','');
  v_consent_recorded_at timestamptz := nullif(p_payload->>'consentRecordedAt','')::timestamptz;
begin
  select * into v_draft
  from public.merchant_intake_drafts
  where id=p_draft_id
  for update;

  if v_draft.id is null then raise exception 'draft_not_found'; end if;
  if v_draft.status='finalized' and v_draft.registration_id is not null then return v_draft.registration_id; end if;
  if v_draft.status <> 'draft' then raise exception 'draft_not_active'; end if;
  if v_draft.expires_at <= now() then
    update public.merchant_intake_drafts set status='expired',updated_at=now() where id=p_draft_id;
    raise exception 'draft_expired';
  end if;

  if not (v_processing and v_privacy and v_terms and v_accuracy) then
    raise exception 'consent_incomplete';
  end if;
  if v_consent_version is null or v_privacy_version is null or v_terms_version is null or v_consent_recorded_at is null then
    raise exception 'consent_metadata_incomplete';
  end if;

  if not public.merchant_intake_menu_allowed(p_menu_items) then
    raise exception 'invalid_menu_items';
  end if;

  if not exists(select 1 from public.merchant_intake_draft_files where draft_id=p_draft_id and role='storefront') then raise exception 'storefront_required'; end if;
  if not exists(select 1 from public.merchant_intake_draft_files where draft_id=p_draft_id and role='food') then raise exception 'food_required'; end if;
  if not exists(select 1 from public.merchant_intake_draft_files where draft_id=p_draft_id and role='menu') then raise exception 'menu_photo_required'; end if;

  select * into v_evidence
  from public.merchant_intake_draft_files
  where draft_id=p_draft_id and role='evidence';

  if v_evidence.id is null and not v_evidence_deferred then raise exception 'evidence_required'; end if;
  if v_evidence.id is not null and v_evidence.evidence_type is distinct from v_evidence_type then raise exception 'evidence_type_mismatch'; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_menu_items) item
    where nullif(item->>'imageKey','') is not null
      and not exists (
        select 1 from public.merchant_intake_draft_files f
        where f.draft_id=p_draft_id
          and f.role='menu-item'
          and f.menu_item_id=(item->>'id')::uuid
          and f.storage_key=item->>'imageKey'
      )
  ) then raise exception 'invalid_menu_image_reference'; end if;

  insert into public.merchant_registrations(
    id,reference_code,status,
    owner_name,representative_role,contact_name,contact_phone,contact_email,
    legal_name,registration_number,official_name,display_name,branch_name,
    address_line1,address_line2,state,district,city,locality,postcode,
    google_maps_url,latitude,longitude,business_phone,whatsapp,website,instagram,facebook,tiktok,
    primary_category,cuisine_tags,food_tags,signature_dishes,price_range,
    service_modes,amenities,short_description,opening_hours,special_hours,
    consent_version,accuracy_confirmed,processing_consent,privacy_notice_accepted,
    merchant_terms_accepted,marketing_opt_in,privacy_version,terms_version,
    consent_recorded_at,consent_evidence_reference,consent_record_status,evidence_deferred,
    source_page,metadata
  ) values (
    v_registration,p_reference_code,'submitted',
    p_payload->>'ownerName',p_payload->>'representativeRole',p_payload->>'contactName',
    p_payload->>'contactPhone',lower(p_payload->>'contactEmail'),
    nullif(p_payload->>'legalName',''),nullif(p_payload->>'registrationNumber',''),
    p_payload->>'officialName',p_payload->>'displayName',nullif(p_payload->>'branchName',''),
    p_payload->>'addressLine1',nullif(p_payload->>'addressLine2',''),
    p_payload->>'state',p_payload->>'district',p_payload->>'city',nullif(p_payload->>'locality',''),
    p_payload->>'postcode',v_maps,v_lat,v_lng,p_payload->>'phone',nullif(p_payload->>'whatsapp',''),
    nullif(p_payload->>'website',''),nullif(p_payload->>'instagram',''),nullif(p_payload->>'facebook',''),nullif(p_payload->>'tiktok',''),
    p_payload->>'primaryCategory',
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'cuisineTags','[]'::jsonb))),'{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'foodTags','[]'::jsonb))),'{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'signatureDishes','[]'::jsonb))),'{}'::text[]),
    coalesce(nullif(p_payload->>'priceRange',''),'unknown'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'serviceModes','[]'::jsonb))),'{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'amenities','[]'::jsonb))),'{}'::text[]),
    p_payload->>'shortDescription',p_payload->'openingHours',nullif(p_payload->>'specialHours',''),
    v_consent_version,v_accuracy,v_processing,v_privacy,
    v_terms,v_marketing,v_privacy_version,v_terms_version,
    v_consent_recorded_at,'merchant-registration:'||p_reference_code,'complete',v_evidence_deferred,
    coalesce(nullif(p_payload->>'sourcePage',''),'/daftar-kedai.html'),
    jsonb_build_object(
      'intake_version','web-v3-menu',
      'draft_id',p_draft_id,
      'consent_source','web_form_v3',
      'evidence_deferred',v_evidence_deferred
    )
  );

  insert into public.merchant_media(registration_id,role,storage_key,mime_type,size_bytes)
  select v_registration,role,storage_key,mime_type,size_bytes
  from public.merchant_intake_draft_files
  where draft_id=p_draft_id and role in ('storefront','food','menu','logo','interior');

  if v_evidence.id is not null then
    insert into public.merchant_evidence(registration_id,evidence_type,storage_key,mime_type,size_bytes)
    values(v_registration,v_evidence.evidence_type,v_evidence.storage_key,v_evidence.mime_type,v_evidence.size_bytes);
  end if;

  insert into public.merchant_menu_media(registration_id,menu_item_id,storage_key,mime_type,size_bytes)
  select v_registration,menu_item_id,storage_key,mime_type,size_bytes
  from public.merchant_intake_draft_files
  where draft_id=p_draft_id and role='menu-item';

  insert into public.merchant_intake_menu_proposals(registration_id,menu_items)
  values(v_registration,p_menu_items);

  insert into public.merchant_workflow_events(registration_id,event_type,old_state,new_state,reason,metadata)
  values
    (v_registration,'intake.submitted',null,'submitted','Merchant submitted V3 onboarding form for admin review.',
      jsonb_build_object(
        'consent_version',v_consent_version,
        'privacy_version',v_privacy_version,
        'terms_version',v_terms_version,
        'consent_recorded_at',v_consent_recorded_at,
        'consent_record_status','complete',
        'evidence_deferred',v_evidence_deferred
      )),
    (v_registration,'menu.submitted',null,'submitted','Merchant submitted structured food and drink menu for admin review.',
      jsonb_build_object('menu_items_count',jsonb_array_length(p_menu_items)));

  if v_evidence_deferred then
    insert into public.merchant_workflow_events(registration_id,event_type,old_state,new_state,reason,metadata)
    values(v_registration,'evidence.deferred',null,'pending',
      'Merchant chose to provide ownership/registration evidence after submission.',
      jsonb_build_object('evidence_type',v_evidence_type));
  end if;

  insert into public.merchant_control_center_sync(registration_id,sync_status,updated_at)
  values(v_registration,
    case when v_evidence_deferred then 'awaiting_evidence' else 'ready' end,
    now())
  on conflict (registration_id) do update
  set sync_status=case when public.merchant_control_center_sync.sync_status in ('submitted','synced')
      then public.merchant_control_center_sync.sync_status
      else excluded.sync_status end,
      updated_at=now();

  update public.merchant_intake_drafts
  set status='finalized',registration_id=v_registration,updated_at=now()
  where id=p_draft_id;

  return v_registration;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.finalize_merchant_partial_v1(p_draft_id uuid,p_record jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE d public.merchant_intake_drafts%rowtype; existing_id uuid; new_id uuid;
BEGIN
 SELECT * INTO d FROM public.merchant_intake_drafts WHERE id=p_draft_id FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'draft_not_found'; END IF;
 SELECT id INTO existing_id FROM public.merchant_partial_registrations WHERE draft_id=p_draft_id;
 IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;
 IF d.status<>'draft' OR d.expires_at<=now() THEN RAISE EXCEPTION 'draft_not_active'; END IF;
 IF d.payload_snapshot IS NULL THEN RAISE EXCEPTION 'snapshot_required'; END IF;
 INSERT INTO public.merchant_partial_registrations(
 reference_code,draft_id,status,display_name,contact_name,contact_phone,contact_email,completion_score,missing_fields,invalid_fields,payload,menu_items,file_manifest,consent_version,privacy_version,terms_version,consent_recorded_at,source_page)
 SELECT r.reference_code,p_draft_id,'incomplete',r.display_name,r.contact_name,r.contact_phone,r.contact_email,r.completion_score,r.missing_fields,r.invalid_fields,r.payload,r.menu_items,r.file_manifest,r.consent_version,r.privacy_version,r.terms_version,r.consent_recorded_at,r.source_page
 FROM jsonb_populate_record(NULL::public.merchant_partial_registrations,p_record) r RETURNING id INTO new_id;
 UPDATE public.merchant_intake_drafts SET status='finalized',updated_at=now() WHERE id=p_draft_id;
 RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_merchant_partial_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_merchant_partial_v1(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_merchant_intake_v3(uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_merchant_intake_v3(uuid,text,jsonb,jsonb) TO service_role;
