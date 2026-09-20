-- BASELINE: schema of the live database (nomi_education, PostgreSQL 16) captured 2026-09-20 with
-- pg_dump -s --no-owner --no-privileges. It replaces the old 0000-0032 chain, which was applied by hand.
-- On the live server this file is recorded as already applied and must NOT be run there.
-- Known harmless differences from src/db/schema/*.ts: fees.billing_type / fees.is_catch_up are nullable here
-- (NOT NULL in the schema file), pdf_annotations.teacher_id is NOT NULL here (nullable in the schema file),
-- fees.submitted_at exists here only. SQL-only CHECK constraints and extra indexes are included.
CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action character varying(100) NOT NULL,
    resource character varying(100) NOT NULL,
    resource_id uuid,
    details text,
    ip_address character varying(45),
    user_agent text,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.assessment_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_id uuid NOT NULL,
    filename character varying(255) NOT NULL,
    original_name character varying(255) NOT NULL,
    file_url character varying(500) NOT NULL,
    mime_type character varying(100) NOT NULL,
    file_size integer NOT NULL,
    uploaded_by uuid,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    file_type character varying(50) DEFAULT 'question_paper'::character varying NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.assessment_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_id uuid NOT NULL,
    student_id uuid NOT NULL,
    score numeric(5,2),
    feedback text,
    submitted_at timestamp without time zone,
    graded_at timestamp without time zone,
    graded_by uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    teacher_id uuid,
    title character varying(255) NOT NULL,
    description text,
    max_score numeric(5,2) NOT NULL,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.attendance_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_event_id uuid NOT NULL,
    student_id uuid NOT NULL,
    status character varying(20) NOT NULL,
    joined_at timestamp without time zone,
    left_at timestamp without time zone,
    duration_minutes integer,
    source character varying(20) DEFAULT 'teams'::character varying NOT NULL,
    synced_at timestamp without time zone DEFAULT now(),
    teams_participant_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    role character varying(20) DEFAULT 'student'::character varying NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.attendance_sync_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_event_id uuid NOT NULL,
    synced_at timestamp without time zone DEFAULT now() NOT NULL,
    status character varying(20) NOT NULL,
    participant_count integer,
    error_message text,
    synced_by character varying(20) DEFAULT 'cron'::character varying
);
--> statement-breakpoint
CREATE TABLE public.course_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    timeslot_id uuid,
    course_id uuid NOT NULL,
    room_id uuid,
    teacher_id uuid,
    event_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    status character varying(20) DEFAULT 'scheduled'::character varying NOT NULL,
    class_type character varying(20) DEFAULT 'local'::character varying NOT NULL,
    notes text,
    recording_url character varying(500),
    teams_meeting_id text,
    teams_meeting_url text,
    teams_created_by uuid,
    attendance_synced boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    is_overridden boolean DEFAULT false,
    CONSTRAINT course_events_class_type_check CHECK (((class_type)::text = ANY ((ARRAY['online'::character varying, 'local'::character varying, 'hybrid'::character varying, '1-to-1'::character varying])::text[])))
);
--> statement-breakpoint
CREATE TABLE public.course_teachers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    percentage_cut numeric(5,2) NOT NULL,
    assigned_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.course_timeslots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    room_id uuid,
    teacher_id uuid,
    days_of_week integer[] NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    recurrence_type character varying(20) NOT NULL,
    start_date date NOT NULL,
    end_date date,
    class_type character varying(20) DEFAULT 'local'::character varying NOT NULL,
    teams_meeting_id text,
    teams_meeting_url text,
    teams_created_by uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT course_timeslots_class_type_check CHECK (((class_type)::text = ANY ((ARRAY['online'::character varying, 'local'::character varying, 'hybrid'::character varying, '1-to-1'::character varying])::text[])))
);
--> statement-breakpoint
CREATE TABLE public.courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    duration integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by uuid,
    course_level character varying(20),
    whatsapp_group_link text,
    course_category character varying(10),
    subject character varying(100),
    teacher_name character varying(100),
    student_name character varying(100),
    end_date date
);
--> statement-breakpoint
COMMENT ON COLUMN public.courses.course_level IS 'Course level: ig or alevel';
--> statement-breakpoint
CREATE TABLE public.enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    course_id uuid NOT NULL,
    enrolled_at timestamp without time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    attendance_mode character varying(20) DEFAULT 'local'::character varying NOT NULL,
    class_type character varying(20),
    custom_fee_per_month numeric(10,2),
    fee_type character varying(20) DEFAULT 'custom'::character varying,
    fee_notes text,
    start_date date,
    end_date date,
    completed_at timestamp without time zone,
    dropped_at timestamp without time zone,
    will_return_after_drop boolean,
    tentative_return_date date,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    per_session_fee numeric(10,2),
    currency character varying(3) DEFAULT 'PKR'::character varying NOT NULL,
    expected_classes_per_month integer,
    prorate_first_month boolean DEFAULT false NOT NULL,
    CONSTRAINT enrollments_currency_check CHECK (((currency)::text = ANY ((ARRAY['PKR'::character varying, 'USD'::character varying, 'GBP'::character varying, 'SAR'::character varying])::text[])))
);
--> statement-breakpoint
COMMENT ON COLUMN public.enrollments.per_session_fee IS 'Fee charged per completed session for 1-to-1 classes. Only used when classType = ''1-to-1''. NULL for regular classes.';
--> statement-breakpoint
COMMENT ON COLUMN public.enrollments.currency IS 'Currency code for online students: PKR, USD, GBP, SAR';
--> statement-breakpoint
CREATE TABLE public.fees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    enrollment_id uuid NOT NULL,
    student_id uuid NOT NULL,
    course_id uuid NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    due_date date NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    submitted_at timestamp without time zone,
    received_at timestamp without time zone,
    received_by uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    billing_type character varying(20) DEFAULT 'monthly'::character varying,
    session_count integer,
    billing_period_start date,
    billing_period_end date,
    is_catch_up boolean DEFAULT false,
    fee_notes text,
    currency character varying(3) DEFAULT 'PKR'::character varying NOT NULL,
    serial_number character varying(255),
    CONSTRAINT fees_billing_type_check CHECK (((billing_type)::text = ANY ((ARRAY['monthly'::character varying, 'usage'::character varying, 'catch-up'::character varying])::text[]))),
    CONSTRAINT fees_currency_check CHECK (((currency)::text = ANY ((ARRAY['PKR'::character varying, 'USD'::character varying, 'GBP'::character varying, 'SAR'::character varying])::text[])))
);
--> statement-breakpoint
COMMENT ON COLUMN public.fees.currency IS 'Currency code for this fee';
--> statement-breakpoint
CREATE TABLE public.invoice_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    description character varying(255) NOT NULL,
    course_id uuid,
    fee_id uuid,
    quantity numeric(10,2) DEFAULT '1'::numeric NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    amount numeric(10,2) NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_number character varying(50) NOT NULL,
    type character varying(20) NOT NULL,
    recipient_id uuid NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    pdf_url character varying(500),
    simplified_pdf_url character varying(500),
    emailed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    generated_by uuid,
    version integer DEFAULT 1 NOT NULL,
    is_latest boolean DEFAULT true NOT NULL,
    currency character varying(3) DEFAULT 'PKR'::character varying NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.lead_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    template_id uuid,
    message_type character varying(50) NOT NULL,
    message_content text NOT NULL,
    whatsapp_message_id character varying(255),
    delivery_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    scheduled_for timestamp without time zone,
    sent_at timestamp without time zone,
    delivered_at timestamp without time zone,
    read_at timestamp without time zone,
    error_message text,
    retry_count integer DEFAULT 0 NOT NULL,
    sent_by uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
COMMENT ON TABLE public.lead_messages IS 'Tracking of all WhatsApp messages sent to leads';
--> statement-breakpoint
COMMENT ON COLUMN public.lead_messages.message_type IS 'Type: re_engagement, course_info, follow_up, ad_hoc';
--> statement-breakpoint
COMMENT ON COLUMN public.lead_messages.message_content IS 'Actual message content sent (with parameters filled in)';
--> statement-breakpoint
COMMENT ON COLUMN public.lead_messages.whatsapp_message_id IS 'Message ID returned by WhatsApp Business API';
--> statement-breakpoint
COMMENT ON COLUMN public.lead_messages.delivery_status IS 'Status: pending, sent, delivered, read, failed';
--> statement-breakpoint
COMMENT ON COLUMN public.lead_messages.scheduled_for IS 'Timestamp for scheduled messages (NULL for immediate send)';
--> statement-breakpoint
CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(200) NOT NULL,
    phone character varying(20) NOT NULL,
    email character varying(255),
    notes text,
    status character varying(20) DEFAULT 'new'::character varying NOT NULL,
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    potential_join_date date,
    next_message_date date,
    original_enrollment_id uuid,
    tentative_return_date date,
    opted_out boolean DEFAULT false NOT NULL,
    opted_out_at timestamp without time zone,
    created_by uuid,
    converted_to_student_id uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
COMMENT ON TABLE public.leads IS 'Potential students for marketing and re-engagement campaigns';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.name IS 'Full name of the potential student';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.phone IS 'Primary contact phone number (WhatsApp number in international format)';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.status IS 'Lead status: new, contacted, interested, enrolled, or lost';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.source IS 'How the lead was created: manual, dropped_enrollment, referral, website, etc.';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.potential_join_date IS 'Estimated date when the lead might enroll';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.next_message_date IS 'Next scheduled date to send a marketing message';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.original_enrollment_id IS 'Reference to enrollment if lead was created from a dropped student';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.tentative_return_date IS 'Date from willReturnAfterDrop when student dropped';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.opted_out IS 'Whether the lead has opted out of marketing messages';
--> statement-breakpoint
COMMENT ON COLUMN public.leads.converted_to_student_id IS 'User ID if lead successfully enrolled as a student';
--> statement-breakpoint
CREATE TABLE public.message_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    template_type character varying(50) NOT NULL,
    whatsapp_template_name character varying(255),
    whatsapp_template_language character varying(10) DEFAULT 'en'::character varying,
    subject character varying(200),
    body text NOT NULL,
    approval_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
COMMENT ON TABLE public.message_templates IS 'WhatsApp message templates for marketing campaigns';
--> statement-breakpoint
COMMENT ON COLUMN public.message_templates.name IS 'Internal name for the template';
--> statement-breakpoint
COMMENT ON COLUMN public.message_templates.template_type IS 'Type: re_engagement, course_info, follow_up, reminder';
--> statement-breakpoint
COMMENT ON COLUMN public.message_templates.whatsapp_template_name IS 'Approved template name in Meta Business Manager';
--> statement-breakpoint
COMMENT ON COLUMN public.message_templates.whatsapp_template_language IS 'Template language code (e.g., en, ur)';
--> statement-breakpoint
COMMENT ON COLUMN public.message_templates.body IS 'Template content with placeholders {{1}}, {{2}}, etc.';
--> statement-breakpoint
COMMENT ON COLUMN public.message_templates.approval_status IS 'Meta approval status: pending, approved, rejected';
--> statement-breakpoint
CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fee_id uuid NOT NULL,
    student_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    payment_method character varying(50) NOT NULL,
    transaction_id character varying(255),
    payment_date timestamp without time zone NOT NULL,
    proof_url character varying(500),
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by uuid
);
--> statement-breakpoint
CREATE TABLE public.pdf_annotations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    result_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    page_number integer NOT NULL,
    annotation_type character varying(50) NOT NULL,
    annotation_data jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    capacity integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token character varying(500) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.submission_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    result_id uuid NOT NULL,
    filename character varying(255) NOT NULL,
    original_name character varying(255) NOT NULL,
    file_url character varying(500) NOT NULL,
    mime_type character varying(100) NOT NULL,
    file_size integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.teams_oauth (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    scope text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(20),
    parent_phone character varying(20),
    student_category character varying(20),
    is_active boolean DEFAULT true NOT NULL,
    last_password_reset timestamp without time zone,
    local_student_fee_percentage numeric(5,2),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by uuid,
    student_subcategory character varying(30),
    online_student_fixed_amount_ig numeric(10,2),
    online_student_fixed_amount_alevel numeric(10,2),
    whatsapp_group_link text,
    teams_username character varying(100),
    teacher_payment_type character varying(20) DEFAULT 'percentage_based'::character varying,
    monthly_salary numeric(10,2),
    must_change_password boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
COMMENT ON COLUMN public.users.student_subcategory IS 'Student subcategory: aitchison, preschool, summer_camp, academy (junior) or local, online (senior)';
--> statement-breakpoint
COMMENT ON COLUMN public.users.online_student_fixed_amount_ig IS 'Fixed amount paid to teacher for online students in IG courses';
--> statement-breakpoint
COMMENT ON COLUMN public.users.online_student_fixed_amount_alevel IS 'Fixed amount paid to teacher for online students in A Level courses';
--> statement-breakpoint
CREATE TABLE public.whatsapp_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    access_token text NOT NULL,
    phone_number_id character varying(255) NOT NULL,
    business_account_id character varying(255) NOT NULL,
    webhook_verify_token character varying(255),
    created_by uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
COMMENT ON TABLE public.whatsapp_credentials IS 'Encrypted WhatsApp Business API credentials (Meta Cloud API)';
--> statement-breakpoint
COMMENT ON COLUMN public.whatsapp_credentials.is_active IS 'Only one credential set should be active at a time';
--> statement-breakpoint
COMMENT ON COLUMN public.whatsapp_credentials.access_token IS 'Encrypted permanent access token from Meta Business';
--> statement-breakpoint
COMMENT ON COLUMN public.whatsapp_credentials.phone_number_id IS 'WhatsApp Business Phone Number ID from Meta';
--> statement-breakpoint
COMMENT ON COLUMN public.whatsapp_credentials.business_account_id IS 'Meta Business Account ID';
--> statement-breakpoint
COMMENT ON COLUMN public.whatsapp_credentials.webhook_verify_token IS 'Encrypted token for webhook verification';
--> statement-breakpoint
ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.assessment_files
    ADD CONSTRAINT assessment_files_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.assessment_results
    ADD CONSTRAINT assessment_results_assessment_id_student_id_unique UNIQUE (assessment_id, student_id);
--> statement-breakpoint
ALTER TABLE ONLY public.assessment_results
    ADD CONSTRAINT assessment_results_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_course_event_id_student_id_unique UNIQUE (course_event_id, student_id);
--> statement-breakpoint
ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.attendance_sync_log
    ADD CONSTRAINT attendance_sync_log_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.course_events
    ADD CONSTRAINT course_events_course_id_event_date_start_time_unique UNIQUE (course_id, event_date, start_time);
--> statement-breakpoint
ALTER TABLE ONLY public.course_events
    ADD CONSTRAINT course_events_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.course_teachers
    ADD CONSTRAINT course_teachers_course_id_teacher_id_unique UNIQUE (course_id, teacher_id);
--> statement-breakpoint
ALTER TABLE ONLY public.course_teachers
    ADD CONSTRAINT course_teachers_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.course_timeslots
    ADD CONSTRAINT course_timeslots_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_student_id_course_id_unique UNIQUE (student_id, course_id);
--> statement-breakpoint
ALTER TABLE ONLY public.fees
    ADD CONSTRAINT fees_enrollment_id_month_year_unique UNIQUE (enrollment_id, month, year);
--> statement-breakpoint
ALTER TABLE ONLY public.fees
    ADD CONSTRAINT fees_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_unique UNIQUE (invoice_number);
--> statement-breakpoint
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.lead_messages
    ADD CONSTRAINT lead_messages_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_name_key UNIQUE (name);
--> statement-breakpoint
ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.pdf_annotations
    ADD CONSTRAINT pdf_annotations_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_token_unique UNIQUE (token);
--> statement-breakpoint
ALTER TABLE ONLY public.submission_files
    ADD CONSTRAINT submission_files_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.submission_files
    ADD CONSTRAINT submission_files_result_id_unique UNIQUE (result_id);
--> statement-breakpoint
ALTER TABLE ONLY public.teams_oauth
    ADD CONSTRAINT teams_oauth_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.teams_oauth
    ADD CONSTRAINT teams_oauth_user_id_unique UNIQUE (user_id);
--> statement-breakpoint
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);
--> statement-breakpoint
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);
--> statement-breakpoint
ALTER TABLE ONLY public.whatsapp_credentials
    ADD CONSTRAINT whatsapp_credentials_pkey PRIMARY KEY (id);
--> statement-breakpoint
CREATE INDEX attendance_event_idx ON public.attendance_records USING btree (course_event_id);
--> statement-breakpoint
CREATE INDEX attendance_student_idx ON public.attendance_records USING btree (student_id);
--> statement-breakpoint
CREATE INDEX attendance_synced_idx ON public.attendance_records USING btree (synced_at);
--> statement-breakpoint
CREATE INDEX fees_billing_type_idx ON public.fees USING btree (billing_type);
--> statement-breakpoint
CREATE INDEX idx_enrollments_currency ON public.enrollments USING btree (currency);
--> statement-breakpoint
CREATE INDEX idx_fees_currency ON public.fees USING btree (currency);
--> statement-breakpoint
CREATE INDEX idx_invoices_latest ON public.invoices USING btree (recipient_id, month, year, type, is_latest) WHERE (is_latest = true);
--> statement-breakpoint
CREATE INDEX lead_messages_lead_idx ON public.lead_messages USING btree (lead_id);
--> statement-breakpoint
CREATE INDEX lead_messages_scheduled_idx ON public.lead_messages USING btree (scheduled_for);
--> statement-breakpoint
CREATE INDEX lead_messages_status_idx ON public.lead_messages USING btree (delivery_status);
--> statement-breakpoint
CREATE INDEX leads_next_message_idx ON public.leads USING btree (next_message_date);
--> statement-breakpoint
CREATE INDEX leads_phone_idx ON public.leads USING btree (phone);
--> statement-breakpoint
CREATE INDEX leads_source_idx ON public.leads USING btree (source);
--> statement-breakpoint
CREATE INDEX leads_status_idx ON public.leads USING btree (status);
--> statement-breakpoint
ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.assessment_files
    ADD CONSTRAINT assessment_files_assessment_id_assessments_id_fk FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.assessment_files
    ADD CONSTRAINT assessment_files_uploaded_by_users_id_fk FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.assessment_results
    ADD CONSTRAINT assessment_results_assessment_id_assessments_id_fk FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.assessment_results
    ADD CONSTRAINT assessment_results_graded_by_users_id_fk FOREIGN KEY (graded_by) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.assessment_results
    ADD CONSTRAINT assessment_results_student_id_users_id_fk FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_course_id_courses_id_fk FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_teacher_id_users_id_fk FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_course_event_id_course_events_id_fk FOREIGN KEY (course_event_id) REFERENCES public.course_events(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_student_id_users_id_fk FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.attendance_sync_log
    ADD CONSTRAINT attendance_sync_log_course_event_id_course_events_id_fk FOREIGN KEY (course_event_id) REFERENCES public.course_events(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.course_events
    ADD CONSTRAINT course_events_course_id_courses_id_fk FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.course_events
    ADD CONSTRAINT course_events_room_id_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.course_events
    ADD CONSTRAINT course_events_teacher_id_users_id_fk FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.course_events
    ADD CONSTRAINT course_events_teams_created_by_users_id_fk FOREIGN KEY (teams_created_by) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.course_events
    ADD CONSTRAINT course_events_timeslot_id_course_timeslots_id_fk FOREIGN KEY (timeslot_id) REFERENCES public.course_timeslots(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.course_teachers
    ADD CONSTRAINT course_teachers_course_id_courses_id_fk FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.course_teachers
    ADD CONSTRAINT course_teachers_teacher_id_users_id_fk FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.course_timeslots
    ADD CONSTRAINT course_timeslots_course_id_courses_id_fk FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.course_timeslots
    ADD CONSTRAINT course_timeslots_room_id_rooms_id_fk FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.course_timeslots
    ADD CONSTRAINT course_timeslots_teacher_id_users_id_fk FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.course_timeslots
    ADD CONSTRAINT course_timeslots_teams_created_by_users_id_fk FOREIGN KEY (teams_created_by) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_course_id_courses_id_fk FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_student_id_users_id_fk FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.fees
    ADD CONSTRAINT fees_course_id_courses_id_fk FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.fees
    ADD CONSTRAINT fees_enrollment_id_enrollments_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.fees
    ADD CONSTRAINT fees_received_by_users_id_fk FOREIGN KEY (received_by) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.fees
    ADD CONSTRAINT fees_student_id_users_id_fk FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_course_id_courses_id_fk FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_fee_id_fees_id_fk FOREIGN KEY (fee_id) REFERENCES public.fees(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoice_id_invoices_id_fk FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_generated_by_users_id_fk FOREIGN KEY (generated_by) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_recipient_id_users_id_fk FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.lead_messages
    ADD CONSTRAINT lead_messages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.lead_messages
    ADD CONSTRAINT lead_messages_sent_by_users_id_fk FOREIGN KEY (sent_by) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.lead_messages
    ADD CONSTRAINT lead_messages_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.message_templates(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_converted_to_student_id_fkey FOREIGN KEY (converted_to_student_id) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_original_enrollment_id_fkey FOREIGN KEY (original_enrollment_id) REFERENCES public.enrollments(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_fee_id_fees_id_fk FOREIGN KEY (fee_id) REFERENCES public.fees(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_student_id_users_id_fk FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.pdf_annotations
    ADD CONSTRAINT pdf_annotations_result_id_assessment_results_id_fk FOREIGN KEY (result_id) REFERENCES public.assessment_results(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.pdf_annotations
    ADD CONSTRAINT pdf_annotations_teacher_id_users_id_fk FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.submission_files
    ADD CONSTRAINT submission_files_result_id_assessment_results_id_fk FOREIGN KEY (result_id) REFERENCES public.assessment_results(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.teams_oauth
    ADD CONSTRAINT teams_oauth_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.whatsapp_credentials
    ADD CONSTRAINT whatsapp_credentials_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
