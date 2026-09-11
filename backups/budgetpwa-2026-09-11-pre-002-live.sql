--
-- PostgreSQL database dump
--

\restrict UQaLmWL7BmV3xgU0vAYQdfSuTy83IFeef2IBjnKhPuBs24998BYzUGpScvwhzne

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: budgetpwa
--

CREATE TABLE public.categories (
    id text NOT NULL,
    name text NOT NULL,
    icon text DEFAULT '💸'::text NOT NULL,
    color text DEFAULT '#4F8EF7'::text NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT categories_name_not_blank CHECK ((length(btrim(name)) > 0))
);


ALTER TABLE public.categories OWNER TO budgetpwa;

--
-- Name: category_budgets; Type: TABLE; Schema: public; Owner: budgetpwa
--

CREATE TABLE public.category_budgets (
    month_key text NOT NULL,
    category_id text NOT NULL,
    amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    CONSTRAINT category_budgets_amount_nonnegative CHECK ((amount >= (0)::numeric))
);


ALTER TABLE public.category_budgets OWNER TO budgetpwa;

--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: budgetpwa
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


ALTER TABLE public.knex_migrations OWNER TO budgetpwa;

--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: budgetpwa
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_id_seq OWNER TO budgetpwa;

--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: budgetpwa
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: budgetpwa
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE public.knex_migrations_lock OWNER TO budgetpwa;

--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: budgetpwa
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNER TO budgetpwa;

--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: budgetpwa
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: months; Type: TABLE; Schema: public; Owner: budgetpwa
--

CREATE TABLE public.months (
    month_key text NOT NULL,
    income_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    income_updated_at timestamp with time zone,
    CONSTRAINT months_month_key_format CHECK ((month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'::text))
);


ALTER TABLE public.months OWNER TO budgetpwa;

--
-- Name: settings; Type: TABLE; Schema: public; Owner: budgetpwa
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value text
);


ALTER TABLE public.settings OWNER TO budgetpwa;

--
-- Name: transactions; Type: TABLE; Schema: public; Owner: budgetpwa
--

CREATE TABLE public.transactions (
    id text NOT NULL,
    month_key text NOT NULL,
    category_id text NOT NULL,
    amount numeric(14,2) NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    date timestamp with time zone NOT NULL
);


ALTER TABLE public.transactions OWNER TO budgetpwa;

--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: budgetpwa
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: budgetpwa
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: budgetpwa
--

COPY public.categories (id, name, icon, color, archived, created_at) FROM stdin;
cat_5c33cd82	Alimentacion	🥗	#22c55e	f	2026-08-31 22:41:58.291334+00
cat_d907ea15	Salud	🩺	#4f8ef7	f	2026-08-31 22:42:17.857228+00
cat_7f5283df	Gatos	🐈‍⬛	#64748b	f	2026-08-31 22:42:37.433778+00
cat_89b3b683	Hogar	🏠	#22c55e	f	2026-08-31 22:44:06.337418+00
cat_93e22228	Condominio	🏡	#14b8a6	f	2026-08-31 22:45:01.832227+00
cat_cdf06dd0	Salida	🎡	#ec4899	f	2026-08-31 22:47:31.328534+00
cat_af49ebc5	Pagos Digitales	🫆	#4239d2	f	2026-08-31 22:48:20.456282+00
cat_25655c96	Diezmo	💸	#64748b	f	2026-08-31 22:49:32.305546+00
cat_94973c8e	Yuri	🙎🏽	#a855f7	f	2026-08-31 22:53:43.639221+00
cat_0d227edc	Agueda	👵🏽	#ec4899	f	2026-08-31 22:55:56.593512+00
cat_d4e64521	Ofrendas	🤲🏼	#b2e24b	f	2026-09-05 16:32:53.410198+00
cat_5416bc2a	Ahorros	🪎	#4f8ef7	f	2026-08-31 22:50:35.181722+00
\.


--
-- Data for Name: category_budgets; Type: TABLE DATA; Schema: public; Owner: budgetpwa
--

COPY public.category_budgets (month_key, category_id, amount) FROM stdin;
2026-09	cat_5c33cd82	400.00
2026-08	cat_5c33cd82	0.00
2026-09	cat_d907ea15	160.00
2026-08	cat_d907ea15	0.00
2026-09	cat_7f5283df	50.00
2026-08	cat_7f5283df	0.00
2026-09	cat_89b3b683	150.00
2026-08	cat_89b3b683	0.00
2026-09	cat_93e22228	50.00
2026-08	cat_93e22228	0.00
2026-09	cat_cdf06dd0	150.00
2026-08	cat_cdf06dd0	0.00
2026-09	cat_af49ebc5	65.00
2026-08	cat_af49ebc5	0.00
2026-09	cat_25655c96	280.00
2026-08	cat_25655c96	0.00
2026-08	cat_5416bc2a	0.00
2026-09	cat_94973c8e	156.00
2026-08	cat_94973c8e	0.00
2026-09	cat_0d227edc	207.00
2026-08	cat_0d227edc	0.00
2026-09	cat_d4e64521	100.00
2026-09	cat_5416bc2a	272.00
\.


--
-- Data for Name: knex_migrations; Type: TABLE DATA; Schema: public; Owner: budgetpwa
--

COPY public.knex_migrations (id, name, batch, migration_time) FROM stdin;
1	001_init.js	1	2026-08-31 22:39:23.109+00
\.


--
-- Data for Name: knex_migrations_lock; Type: TABLE DATA; Schema: public; Owner: budgetpwa
--

COPY public.knex_migrations_lock (index, is_locked) FROM stdin;
1	0
\.


--
-- Data for Name: months; Type: TABLE DATA; Schema: public; Owner: budgetpwa
--

COPY public.months (month_key, income_amount, income_updated_at) FROM stdin;
2026-09	2040.00	2026-09-01 13:02:29.715382+00
2026-08	0.00	2026-09-01 13:02:29.747418+00
2026-07	0.00	\N
2026-05	0.00	\N
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: budgetpwa
--

COPY public.settings (key, value) FROM stdin;
active_month	2026-09
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: budgetpwa
--

COPY public.transactions (id, month_key, category_id, amount, note, date) FROM stdin;
txn_acbe74d6	2026-09	cat_cdf06dd0	18.00	Boulevard	2026-09-01 23:19:12.451+00
txn_a6eb00c7	2026-09	cat_cdf06dd0	9.50	9.5	2026-09-01 23:18:55.953+00
txn_fa9f87c3	2026-09	cat_94973c8e	5.50	Chuches mexicanas	2026-09-01 23:17:19.279+00
txn_d91bb667	2026-09	cat_7f5283df	13.00	Gatarina	2026-09-01 23:16:42.917+00
txn_ddae2cfa	2026-09	cat_89b3b683	15.00	15	2026-09-01 23:16:28.356+00
txn_6a5fd101	2026-09	cat_89b3b683	7.50	Limpotex	2026-09-01 23:16:10.188+00
txn_0d8e5f4b	2026-09	cat_89b3b683	42.50	Limpieza aires	2026-09-01 23:15:53.367+00
txn_8ed0abe5	2026-09	cat_5c33cd82	1.00	Tulipan	2026-09-01 23:15:21.77+00
txn_5c3772b1	2026-09	cat_5c33cd82	10.00	Rio	2026-09-01 23:15:14.68+00
txn_278c8501	2026-09	cat_5c33cd82	49.00	Pollera	2026-09-01 23:15:00.16+00
txn_570c662f	2026-09	cat_94973c8e	21.50	Entrada	2026-09-01 23:13:15.231+00
txn_0a2e0582	2026-09	cat_94973c8e	2.50	Movistar	2026-09-01 23:04:53.896+00
txn_efe6d5dd	2026-09	cat_d907ea15	28.00	Farmatodo	2026-09-01 23:04:12.172+00
txn_f5c9c60d	2026-09	cat_89b3b683	2.00	Corpoelec	2026-09-01 23:03:55.663+00
txn_1081c90a	2026-09	cat_5c33cd82	8.50	Yuli	2026-09-01 23:03:34.613+00
txn_5b646e3d	2026-09	cat_94973c8e	1.98	Gift card icloud	2026-09-02 13:55:13.45+00
txn_6c9d51a3	2026-09	cat_93e22228	33.50	Agosto	2026-09-03 14:38:07.629+00
txn_0821bd84	2026-09	cat_94973c8e	11.50	Compras para cumple Tati	2026-09-03 20:40:58.48+00
txn_651273c9	2026-09	cat_94973c8e	2.00	Colitas	2026-09-03 20:45:20.617+00
txn_9bc69494	2026-09	cat_cdf06dd0	4.00	cafe	2026-09-03 20:46:20.054+00
txn_6da945db	2026-09	cat_5c33cd82	7.00	Pollera	2026-09-03 20:46:40.56+00
txn_5f47e747	2026-09	cat_d907ea15	56.50	Previasis	2026-09-03 20:47:19.594+00
txn_9db4b50e	2026-09	cat_d907ea15	14.50	Farmatodo	2026-09-03 20:48:15.884+00
txn_31058605	2026-09	cat_5c33cd82	10.50	Polleras	2026-09-03 20:48:42.485+00
txn_20f99543	2026-09	cat_5c33cd82	6.50	Leche	2026-09-03 20:49:14.262+00
txn_603f2a44	2026-09	cat_cdf06dd0	4.00	Tulipan	2026-09-03 20:49:45.495+00
txn_995e5b95	2026-09	cat_5c33cd82	10.50	Merkafur	2026-09-03 20:50:41.793+00
txn_12928b90	2026-09	cat_7f5283df	65.00	Gatarina	2026-09-03 21:46:18.713+00
txn_14d89449	2026-09	cat_5c33cd82	8.00	Yuli	2026-09-05 15:46:10.25+00
txn_129fae38	2026-09	cat_d907ea15	7.00	Farmatodo	2026-09-05 15:48:20.853+00
txn_2dfa0cf0	2026-09	cat_94973c8e	3.00	Farmatodo	2026-09-05 15:48:54.08+00
txn_630c1e1c	2026-09	cat_5c33cd82	68.00	Cecosesola	2026-09-05 16:03:43.988+00
txn_4050bdee	2026-09	cat_94973c8e	9.50	Moca	2026-09-05 16:08:47.341+00
txn_396305b4	2026-09	cat_94973c8e	7.00	Pollo Dorado	2026-09-05 16:10:25.989+00
txn_8d17dcce	2026-09	cat_25655c96	280.00	Diezmo Global	2026-09-05 16:11:16.71+00
txn_71e354a0	2026-09	cat_af49ebc5	26.50	Spotify y Claude	2026-09-05 16:28:31.268+00
txn_09e498ca	2026-09	cat_0d227edc	30.00	Bolivares	2026-09-08 18:54:10.449+00
txn_4d0b9bab	2026-09	cat_cdf06dd0	6.50	Catta cafe	2026-09-08 19:09:26.966+00
\.


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: budgetpwa
--

SELECT pg_catalog.setval('public.knex_migrations_id_seq', 1, true);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE SET; Schema: public; Owner: budgetpwa
--

SELECT pg_catalog.setval('public.knex_migrations_lock_index_seq', 1, true);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: budgetpwa
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: category_budgets category_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: budgetpwa
--

ALTER TABLE ONLY public.category_budgets
    ADD CONSTRAINT category_budgets_pkey PRIMARY KEY (month_key, category_id);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: budgetpwa
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: budgetpwa
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: months months_pkey; Type: CONSTRAINT; Schema: public; Owner: budgetpwa
--

ALTER TABLE ONLY public.months
    ADD CONSTRAINT months_pkey PRIMARY KEY (month_key);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: budgetpwa
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: budgetpwa
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: transactions_month_cat_idx; Type: INDEX; Schema: public; Owner: budgetpwa
--

CREATE INDEX transactions_month_cat_idx ON public.transactions USING btree (month_key, category_id);


--
-- Name: transactions_month_idx; Type: INDEX; Schema: public; Owner: budgetpwa
--

CREATE INDEX transactions_month_idx ON public.transactions USING btree (month_key);


--
-- Name: category_budgets category_budgets_category_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: budgetpwa
--

ALTER TABLE ONLY public.category_budgets
    ADD CONSTRAINT category_budgets_category_id_foreign FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;


--
-- Name: category_budgets category_budgets_month_key_foreign; Type: FK CONSTRAINT; Schema: public; Owner: budgetpwa
--

ALTER TABLE ONLY public.category_budgets
    ADD CONSTRAINT category_budgets_month_key_foreign FOREIGN KEY (month_key) REFERENCES public.months(month_key) ON DELETE RESTRICT;


--
-- Name: transactions transactions_category_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: budgetpwa
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_category_id_foreign FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;


--
-- Name: transactions transactions_month_key_foreign; Type: FK CONSTRAINT; Schema: public; Owner: budgetpwa
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_month_key_foreign FOREIGN KEY (month_key) REFERENCES public.months(month_key) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict UQaLmWL7BmV3xgU0vAYQdfSuTy83IFeef2IBjnKhPuBs24998BYzUGpScvwhzne

